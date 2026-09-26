import { execFileSync } from "node:child_process";
import fs from "node:fs";

const npx=process.platform==="win32"?"npx.cmd":"npx";
const CONFIG="wrangler.performance.jsonc";
const run=(sql)=>{
  const raw=execFileSync(npx,["wrangler","d1","execute","DB","--local","--config",CONFIG,"--json","--command",sql],{encoding:"utf8",maxBuffer:32*1024*1024});
  const i=raw.indexOf("[");
  return JSON.parse(raw.slice(i))[0]?.results??[];
};
const one=sql=>run(sql)[0];
const meta=JSON.parse(fs.readFileSync("performance-output/performance-5y-realistic-meta.json","utf8"));
const group=meta.groupId;
const secondaryGroups=meta.secondaryGroups??[];
const q=v=>"'"+String(v).replaceAll("'","''")+"'";

const counts=one(`SELECT
 (SELECT COUNT(*) FROM sessions WHERE group_id=${q(group)}) sessions,
 (SELECT COUNT(*) FROM games g JOIN sessions s ON s.id=g.session_id WHERE s.group_id=${q(group)}) games,
 (SELECT COUNT(*) FROM game_results r JOIN games g ON g.id=r.game_id JOIN sessions s ON s.id=g.session_id WHERE s.group_id=${q(group)}) gameResults,
 (SELECT COUNT(*) FROM group_players WHERE group_id=${q(group)}) players`);

const badGameTotals=one(`SELECT COUNT(*) bad FROM (
 SELECT g.id,COUNT(r.player_id) n,SUM(r.score_point) total
 FROM games g JOIN sessions s ON s.id=g.session_id
 JOIN game_results r ON r.game_id=g.id
 WHERE s.group_id=${q(group)}
 GROUP BY g.id HAVING n<>3 OR total<>0)`).bad;

const badChipTotals=one(`SELECT COUNT(*) bad FROM (
 SELECT c.session_id,COUNT(*) n,SUM(c.chip_count) total
 FROM chip_results c JOIN sessions s ON s.id=c.session_id
 WHERE s.group_id=${q(group)}
 GROUP BY c.session_id HAVING n<>3 OR total<>0)`).bad;

const active=one(`SELECT COUNT(*) n FROM sessions WHERE group_id=${q(group)} AND status<>'finalized'`).n;
const range=one(`SELECT MIN(n) minGames,MAX(n) maxGames FROM (
 SELECT s.id,COUNT(g.id) n FROM sessions s JOIN games g ON g.session_id=s.id
 WHERE s.group_id=${q(group)} GROUP BY s.id)`);
const participation=run(`SELECT sp.player_id,COUNT(DISTINCT ps.session_id) sessions
 FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id
 JOIN sessions s ON s.id=ps.session_id WHERE s.group_id=${q(group)}
 GROUP BY sp.player_id ORDER BY sp.player_id`);

const groupCounts=run(`SELECT group_id AS groupId,COUNT(*) sessions FROM sessions GROUP BY group_id ORDER BY group_id`);
const expectedGroups=new Map([[group,260],...secondaryGroups.map(g=>[g.id,g.sessions])]);
const unexpectedGroups=groupCounts.filter(row=>!expectedGroups.has(row.groupId));
const badGroupCounts=groupCounts.filter(row=>expectedGroups.get(row.groupId)!==Number(row.sessions));
const crossGroupPlayers=run(`SELECT gp.group_id AS groupId,gp.player_id AS playerId FROM group_players gp ORDER BY gp.group_id,gp.player_id`);
const secondaryIsolation=secondaryGroups.map(g=>({
  groupId:g.id,
  expectedPlayers:[...g.players].sort(),
  actualPlayers:crossGroupPlayers.filter(row=>row.groupId===g.id).map(row=>row.playerId).sort()
}));

const failures=[];
if(Number(counts.sessions)!==260)failures.push("sessions");
if(Number(counts.games)!==3120)failures.push("games");
if(Number(counts.gameResults)!==9360)failures.push("gameResults");
if(Number(counts.players)!==4)failures.push("players");
if(Number(badGameTotals)!==0)failures.push("game score totals");
if(Number(badChipTotals)!==0)failures.push("chip totals");
if(Number(active)!==0)failures.push("base fixture status");
if(Number(range.minGames)!==6||Number(range.maxGames)!==18)failures.push("game count range");
if(participation.length!==4)failures.push("participation");
if(groupCounts.length!==expectedGroups.size||unexpectedGroups.length||badGroupCounts.length)failures.push("multi-group session counts");
if(secondaryIsolation.some(x=>JSON.stringify(x.expectedPlayers)!==JSON.stringify(x.actualPlayers)))failures.push("multi-group player isolation");

const evidence={counts,badGameTotals,badChipTotals,active,range,participation,groupCounts,secondaryIsolation,failures};
fs.writeFileSync("performance-output/performance-5y-local-validation.json",JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
if(failures.length)process.exit(1);
