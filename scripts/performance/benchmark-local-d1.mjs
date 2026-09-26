import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const meta=JSON.parse(fs.readFileSync("performance-output/fixture-meta.json","utf8"));
const npx=process.platform==="win32"?"npx.cmd":"npx";
const quote=(v)=>"'"+String(v).replaceAll("'","''")+"'";
const metas=(value,out=[])=>{
  if(Array.isArray(value)){for(const v of value)metas(v,out);return out;}
  if(value&&typeof value==="object"){
    if(value.meta&&typeof value.meta==="object")out.push(value.meta);
    for(const v of Object.values(value))metas(v,out);
  }
  return out;
};
const metric=(m,...keys)=>{
  for(const key of keys)if(typeof m?.[key]==="number")return m[key];
  return null;
};
const sumOrNull=(values)=>values.length?values.reduce((a,b)=>a+b,0):null;
const run=(sql)=>{
  const start=performance.now();
  const raw=execFileSync(npx,["wrangler","d1","execute","DB","--local","--json","--command",sql],{
    encoding:"utf8",env:process.env,maxBuffer:32*1024*1024
  });
  const wallMs=performance.now()-start;
  const first=Math.min(...["[","{"].map(ch=>{const i=raw.indexOf(ch);return i<0?Number.POSITIVE_INFINITY:i;}));
  const json=JSON.parse(raw.slice(first));
  const ms=metas(json);
  const durations=ms.map(m=>metric(m,"duration")).filter(v=>v!==null);
  const rowsRead=ms.map(m=>metric(m,"rows_read","rowsRead")).filter(v=>v!==null);
  const rowsWritten=ms.map(m=>metric(m,"rows_written","rowsWritten")).filter(v=>v!==null);
  return {
    wallMs,
    serverMs:sumOrNull(durations),
    rowsRead:sumOrNull(rowsRead),
    rowsWritten:sumOrNull(rowsWritten),
    json,
  };
};
const median=(xs)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
const medianOrNull=(xs)=>xs.length?median(xs):null;
const maxOrNull=(xs)=>xs.length?Math.max(...xs):null;
const fmt=(value,digits=0)=>value===null?"n/a":Number(value).toFixed(digits);
const performanceSql=(groupId,extra="")=>`WITH selected AS (
SELECT s.id FROM sessions s WHERE s.group_id=${quote(groupId)} AND s.status='finalized' ${extra}
), participants AS (
SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps
JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id
), game_stats AS (
SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal
FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id
GROUP BY g.session_id,gr.player_id
), session_scores AS (
SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,
COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(cr.chip_count,0) AS chipCount,
COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*5 AS finalPoint
FROM participants p LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id
LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id
), ranked AS (
SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores
)
SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,
SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(finalPoint) AS finalPointTotal,
SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS firstPlaceCount
FROM ranked GROUP BY player_id ORDER BY finalPointTotal DESC`;

const results=[];
let hardFail=false;
for(const p of meta.profiles){
  const ym=`${p.latestYear}-${String(p.latestMonth).padStart(2,"0")}`;
  const cases=[
    ["active_session_lookup",`SELECT id FROM sessions WHERE group_id=${quote(p.groupId)} AND status='active' LIMIT 1`],
    ["history_month",`SELECT s.id,s.session_date AS sessionDate,s.status,
      (SELECT COUNT(*) FROM games g WHERE g.session_id=s.id) AS gameCount
      FROM sessions s WHERE s.group_id=${quote(p.groupId)} AND s.status='finalized'
      AND substr(s.session_date,1,7)=${quote(ym)}
      ORDER BY s.session_date DESC,COALESCE(s.ended_at,s.started_at) DESC,s.id DESC`],
    ["performance_all",performanceSql(p.groupId)],
    ["performance_year",performanceSql(p.groupId,`AND substr(s.session_date,1,4)=${quote(String(p.latestYear))}`)],
    ["performance_month",performanceSql(p.groupId,`AND substr(s.session_date,1,4)=${quote(String(p.latestYear))} AND substr(s.session_date,6,2)=${quote(String(p.latestMonth).padStart(2,"0"))}`)],
    ["session_games",`SELECT id,session_id AS sessionId,segment_id AS segmentId,sequence,played_at AS playedAt,version FROM games WHERE session_id=${quote(p.sampleSessionId)} ORDER BY sequence,id`],
  ];
  run(`SELECT
    (SELECT COUNT(*) FROM sessions WHERE group_id=${quote(p.groupId)}) AS sessions,
    (SELECT COUNT(*) FROM games g JOIN sessions s ON s.id=g.session_id WHERE s.group_id=${quote(p.groupId)}) AS games,
    (SELECT COUNT(*) FROM game_results gr JOIN games g ON g.id=gr.game_id JOIN sessions s ON s.id=g.session_id WHERE s.group_id=${quote(p.groupId)}) AS gameResults`);
  console.log(`fixture ${p.key}: expected ${p.sessions}/${p.games}/${p.gameResults}`);
  for(const [name,sql] of cases){
    const samples=Array.from({length:3},()=>run(sql));
    const server=samples.map(x=>x.serverMs).filter(x=>x!==null);
    const wall=samples.map(x=>x.wallMs);
    const reads=samples.map(x=>x.rowsRead).filter(x=>x!==null);
    const writes=samples.map(x=>x.rowsWritten).filter(x=>x!==null);
    const serverMedian=medianOrNull(server);
    const serverMax=maxOrNull(server);
    const wallMedian=median(wall),wallMax=Math.max(...wall);
    const rowsReadMedian=medianOrNull(reads),rowsReadMax=maxOrNull(reads);
    const rowsWrittenMedian=medianOrNull(writes),rowsWrittenMax=maxOrNull(writes);
    let status="MEASURED";
    if(serverMedian!==null&&serverMax!==null){
      status=serverMedian<=1000&&serverMax<=2000?"PASS":serverMedian>2000?"FAIL":"WARN";
      if(status==="FAIL")hardFail=true;
    }
    results.push({
      profile:p.key,
      sessions:p.sessions,
      games:p.games,
      name,
      status,
      queryCount:1,
      serverMedianMs:serverMedian,
      serverMaxMs:serverMax,
      wallMedianMs:wallMedian,
      wallMaxMs:wallMax,
      rowsReadMedian,
      rowsReadMax,
      rowsWrittenMedian,
      rowsWrittenMax,
    });
  }
}
const costMetricsAvailable=results.some(r=>r.rowsReadMedian!==null||r.rowsWrittenMedian!==null);
fs.writeFileSync("performance-output/results.json",JSON.stringify({generatedAt:new Date().toISOString(),costMetricsAvailable,results},null,2));
const lines=[
  "# Long-term local D1 performance benchmark",
  "",
  "Local D1 on the GitHub runner / 3 samples per case. Target: median <= 1000ms; repeated > 2000ms is a failure signal.",
  "Rows read/written are recorded when Wrangler local D1 exposes those metadata fields. They are regression evidence, not an exact prediction of remote D1 billing.",
  "",
  "| Data | Case | Result | Queries | D1 median ms | D1 max ms | Rows read median | Rows read max | Rows written max | CLI wall median ms |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...results.map(r=>`| ${r.profile} (${r.sessions} sessions / ${r.games} games) | ${r.name} | ${r.status} | ${r.queryCount} | ${fmt(r.serverMedianMs,2)} | ${fmt(r.serverMaxMs,2)} | ${fmt(r.rowsReadMedian)} | ${fmt(r.rowsReadMax)} | ${fmt(r.rowsWrittenMax)} | ${fmt(r.wallMedianMs)} |`),
  "",
  `D1 row-cost metadata available: ${costMetricsAvailable?"yes":"no"}.`,
  "CLI wall time includes Wrangler startup overhead and is recorded separately from D1 query duration. No remote D1 quota is consumed."
];
fs.writeFileSync("performance-output/summary.md",lines.join("\n"));
console.log(lines.join("\n"));
if(hardFail)process.exitCode=1;
