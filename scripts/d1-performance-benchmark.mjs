#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const required = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const database = config.d1_databases?.[0];
const previewId = database?.preview_database_id;
const productionId = database?.database_id;
if (!previewId) throw new Error("Preview D1 database id is missing");
if (previewId === productionId) throw new Error("Refusing benchmark: Preview and Production D1 IDs are identical");

const datasets = [
  { label: "5y", prefix: "perf5", groupId: "__perf_5y", start: "2021-01-03", sessions: 260 },
  { label: "10y", prefix: "perf10", groupId: "__perf_10y", start: "2016-01-03", sessions: 520 },
];
const GAMES_PER_SESSION = 12;
const ITERATIONS = 3;
const SERVER_TARGET_MS = 1000;
const PERIOD_YEAR = "2025";
const PERIOD_MONTH = "06";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const temp = mkdtempSync(join(tmpdir(), "mahjong-score-perf-"));
const fixturePath = join(temp, "fixture.sql");
const artifactDir = "artifacts";
mkdirSync(artifactDir, { recursive: true });

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const dateAtWeek = (start, week) => {
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + week * 7);
  return date.toISOString().slice(0, 10);
};
const isoAt = (date, hour) => `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const cleanupSql = `
PRAGMA foreign_keys=ON;
DELETE FROM game_tags WHERE game_id LIKE 'perf5-%' OR game_id LIKE 'perf10-%';
DELETE FROM game_results WHERE game_id LIKE 'perf5-%' OR game_id LIKE 'perf10-%';
DELETE FROM games WHERE id LIKE 'perf5-%' OR id LIKE 'perf10-%';
DELETE FROM chip_results WHERE session_id LIKE 'perf5-%' OR session_id LIKE 'perf10-%';
DELETE FROM session_participant_notes WHERE session_id LIKE 'perf5-%' OR session_id LIKE 'perf10-%';
DELETE FROM segment_players WHERE segment_id LIKE 'perf5-%' OR segment_id LIKE 'perf10-%';
DELETE FROM participant_segments WHERE id LIKE 'perf5-%' OR id LIKE 'perf10-%';
DELETE FROM sessions WHERE id LIKE 'perf5-%' OR id LIKE 'perf10-%';
DELETE FROM group_memberships WHERE group_id IN ('__perf_5y','__perf_10y');
DELETE FROM group_players WHERE group_id IN ('__perf_5y','__perf_10y');
DELETE FROM players WHERE id LIKE 'perf5-%' OR id LIKE 'perf10-%';
DELETE FROM groups WHERE id IN ('__perf_5y','__perf_10y');
`;

function runWrangler(args, { json = false, quiet = false } = {}) {
  const started = performance.now();
  const result = spawnSync(npx, ["wrangler", ...args], {
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const wallMs = performance.now() - started;
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`wrangler failed (${result.status}): ${args.join(" ")}`);
  }
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  if (!json) return { wallMs, stdout: result.stdout };
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    const start = Math.min(...[result.stdout.indexOf("["), result.stdout.indexOf("{")].filter((x) => x >= 0));
    if (!Number.isFinite(start)) throw new Error(`Could not parse wrangler JSON output: ${result.stdout.slice(0, 500)}`);
    parsed = JSON.parse(result.stdout.slice(start));
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const meta = entries.map((entry) => entry?.meta ?? {}).filter(Boolean);
  return {
    wallMs,
    parsed,
    serverMs: meta.reduce((sum, item) => sum + Number(item.duration ?? 0), 0),
    rowsRead: meta.reduce((sum, item) => sum + Number(item.rows_read ?? 0), 0),
    rowsWritten: meta.reduce((sum, item) => sum + Number(item.rows_written ?? 0), 0),
    statements: entries.length,
  };
}

function executeCommand(sql, options = {}) {
  return runWrangler(["d1", "execute", "DB", "--remote", "--preview", "--yes", ...(options.json ? ["--json"] : []), "--command", sql], options);
}
function executeFile(path) {
  return runWrangler(["d1", "execute", "DB", "--remote", "--preview", "--yes", "--file", path], { quiet: true });
}

function buildFixture() {
  const out = ["PRAGMA foreign_keys=ON;"];
  for (const dataset of datasets) {
    const created = `${dataset.start}T00:00:00.000Z`;
    out.push(`INSERT INTO groups(id,name,version,created_at,updated_at) VALUES(${sqlText(dataset.groupId)},${sqlText(`Performance ${dataset.label}`)},1,${sqlText(created)},${sqlText(created)});`);
    const players = Array.from({ length: 4 }, (_, i) => `${dataset.prefix}-p${i + 1}`);
    players.forEach((playerId, i) => {
      out.push(`INSERT INTO players(id,display_name,user_id,version,created_at,updated_at) VALUES(${sqlText(playerId)},${sqlText(`Perf ${dataset.label} P${i + 1}`)},NULL,1,${sqlText(created)},${sqlText(created)});`);
      out.push(`INSERT INTO group_players(group_id,player_id,active,user_id) VALUES(${sqlText(dataset.groupId)},${sqlText(playerId)},1,NULL);`);
    });
    for (let s = 0; s < dataset.sessions; s += 1) {
      const seq = String(s + 1).padStart(4, "0");
      const sessionId = `${dataset.prefix}-s-${seq}`;
      const segmentId = `${dataset.prefix}-seg-${seq}`;
      const date = dateAtWeek(dataset.start, s);
      const startedAt = isoAt(date, 9);
      const endedAt = isoAt(date, 16);
      const participants = [players[s % 4], players[(s + 1) % 4], players[(s + 2) % 4]];
      out.push(`INSERT INTO sessions(id,group_id,session_date,started_at,ended_at,status,note,version,created_at,updated_at) VALUES(${sqlText(sessionId)},${sqlText(dataset.groupId)},${sqlText(date)},${sqlText(startedAt)},${sqlText(endedAt)},'finalized','performance fixture',1,${sqlText(startedAt)},${sqlText(endedAt)});`);
      out.push(`INSERT INTO participant_segments(id,session_id,sequence) VALUES(${sqlText(segmentId)},${sqlText(sessionId)},1);`);
      participants.forEach((playerId, seat) => {
        out.push(`INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES(${sqlText(segmentId)},${sqlText(playerId)},${seat});`);
        out.push(`INSERT INTO session_participant_notes(session_id,player_id,note) VALUES(${sqlText(sessionId)},${sqlText(playerId)},'benchmark note');`);
      });
      const chips = [2, -1, -1];
      participants.forEach((playerId, i) => out.push(`INSERT INTO chip_results(session_id,player_id,chip_count) VALUES(${sqlText(sessionId)},${sqlText(playerId)},${chips[i]});`));
      for (let g = 0; g < GAMES_PER_SESSION; g += 1) {
        const gameNo = String(g + 1).padStart(2, "0");
        const gameId = `${dataset.prefix}-s-${seq}-g-${gameNo}`;
        out.push(`INSERT INTO games(id,session_id,segment_id,sequence,played_at,version) VALUES(${sqlText(gameId)},${sqlText(sessionId)},${sqlText(segmentId)},${g + 1},${sqlText(isoAt(date, 9 + Math.floor(g / 2)))},1);`);
        const winnerIndex = g % 3;
        const ordered = [participants[winnerIndex], participants[(winnerIndex + 1) % 3], participants[(winnerIndex + 2) % 3]];
        const scores = [20, -10, -10];
        ordered.forEach((playerId, i) => out.push(`INSERT INTO game_results(game_id,player_id,rank,score_point) VALUES(${sqlText(gameId)},${sqlText(playerId)},${i + 1},${scores[i]});`));
        if (g === 0 && s % 50 === 0) out.push(`INSERT INTO game_tags(game_id,tag_order,type,player_id) VALUES(${sqlText(gameId)},1,'yakuman',${sqlText(ordered[0])});`);
      }
    }
  }
  return out.join("\n");
}

const performanceSql = (groupId, extra = "") => `WITH selected AS (SELECT s.id FROM sessions s WHERE s.group_id=${sqlText(groupId)} AND s.status='finalized' ${extra}), participants AS (SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id), game_stats AS (SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id GROUP BY g.session_id,gr.player_id), session_scores AS (SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(cr.chip_count,0) AS chipCount,COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*5 AS finalPoint FROM participants p LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id), ranked AS (SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores) SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(finalPoint) AS finalPointTotal,SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS firstPlaceCount FROM ranked GROUP BY player_id ORDER BY finalPointTotal DESC`;

function benchmarkCases(dataset) {
  const ym = `${PERIOD_YEAR}-${PERIOD_MONTH}`;
  const sampleSession = `${dataset.prefix}-s-${String(dataset.sessions).padStart(4, "0")}`;
  const history = `SELECT s.id,s.group_id AS groupId,s.session_date AS sessionDate,s.started_at AS startedAt,s.ended_at AS endedAt,s.status,s.note,s.version,(SELECT COUNT(*) FROM games g WHERE g.session_id=s.id) AS gameCount FROM sessions s WHERE s.group_id=${sqlText(dataset.groupId)} AND s.status='finalized' AND substr(s.session_date,1,7)=${sqlText(ym)} ORDER BY s.session_date DESC,COALESCE(s.ended_at,s.started_at) DESC,s.id DESC; SELECT session_id AS sessionId,player_id AS playerId,note FROM session_participant_notes WHERE session_id IN (SELECT id FROM sessions WHERE group_id=${sqlText(dataset.groupId)} AND status='finalized' AND substr(session_date,1,7)=${sqlText(ym)}) ORDER BY player_id; SELECT session_id AS sessionId,player_id AS playerId,chip_count AS chipCount FROM chip_results WHERE session_id IN (SELECT id FROM sessions WHERE group_id=${sqlText(dataset.groupId)} AND status='finalized' AND substr(session_date,1,7)=${sqlText(ym)}) ORDER BY player_id`;
  const gameIds = Array.from({ length: GAMES_PER_SESSION }, (_, i) => `${sampleSession}-g-${String(i + 1).padStart(2, "0")}`);
  const gameDetailStatements = [
    `SELECT id,session_id AS sessionId,segment_id AS segmentId,sequence,played_at AS playedAt,version FROM games WHERE session_id=${sqlText(sampleSession)} ORDER BY sequence,id`,
    ...gameIds.flatMap((id) => [
      `SELECT player_id AS playerId,score_point AS scorePoint FROM game_results WHERE game_id=${sqlText(id)} ORDER BY rank`,
      `SELECT type,player_id AS playerId FROM game_tags WHERE game_id=${sqlText(id)} ORDER BY tag_order`,
    ]),
  ].join("; ");
  return [
    { name: "monthly-history", sql: history },
    { name: "performance-all", sql: performanceSql(dataset.groupId) },
    { name: "performance-year", sql: performanceSql(dataset.groupId, `AND substr(s.session_date,1,4)=${sqlText(PERIOD_YEAR)}`) },
    { name: "performance-month", sql: performanceSql(dataset.groupId, `AND substr(s.session_date,1,4)=${sqlText(PERIOD_YEAR)} AND substr(s.session_date,6,2)=${sqlText(PERIOD_MONTH)}`) },
    { name: "session-games-12", sql: gameDetailStatements },
  ];
}

const round = (value) => Math.round(value * 100) / 100;
const average = (values) => values.reduce((a, b) => a + b, 0) / values.length;

let fixtureWallMs = 0;
const results = [];
let benchmarkError;
try {
  console.log("Cleaning previous performance fixture from Preview D1");
  executeCommand(cleanupSql, { quiet: true });
  writeFileSync(fixturePath, buildFixture());
  console.log("Loading 5-year and 10-year fixtures into Preview D1");
  fixtureWallMs = executeFile(fixturePath).wallMs;

  for (const dataset of datasets) {
    for (const benchmark of benchmarkCases(dataset)) {
      const runs = [];
      for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
        const measurement = executeCommand(benchmark.sql, { json: true, quiet: true });
        runs.push({
          iteration,
          wallMs: round(measurement.wallMs),
          serverMs: round(measurement.serverMs),
          rowsRead: measurement.rowsRead,
          rowsWritten: measurement.rowsWritten,
          statements: measurement.statements,
        });
      }
      results.push({ dataset: dataset.label, sessions: dataset.sessions, games: dataset.sessions * GAMES_PER_SESSION, name: benchmark.name, runs });
      console.log(`${dataset.label} ${benchmark.name}: server max ${Math.max(...runs.map((x) => x.serverMs))} ms, CLI wall avg ${round(average(runs.map((x) => x.wallMs)))} ms`);
    }
  }
} catch (error) {
  benchmarkError = error;
} finally {
  try {
    console.log("Cleaning performance fixture from Preview D1");
    executeCommand(cleanupSql, { quiet: true });
  } catch (cleanupError) {
    console.error("Performance fixture cleanup failed", cleanupError);
    if (!benchmarkError) benchmarkError = cleanupError;
  }
  rmSync(temp, { recursive: true, force: true });
}

const evaluated = results.map((entry) => {
  const server = entry.runs.map((x) => x.serverMs);
  const wall = entry.runs.map((x) => x.wallMs);
  return {
    ...entry,
    serverAvgMs: round(average(server)),
    serverMaxMs: round(Math.max(...server)),
    wallAvgMs: round(average(wall)),
    wallMaxMs: round(Math.max(...wall)),
    rowsReadAvg: round(average(entry.runs.map((x) => x.rowsRead))),
    pass: Math.max(...server) <= SERVER_TARGET_MS,
  };
});
const allPass = !benchmarkError && evaluated.length === datasets.length * 5 && evaluated.every((x) => x.pass);
const report = {
  generatedAt: new Date().toISOString(),
  previewDatabaseId: previewId,
  productionDatabaseId: productionId,
  fixtureLoadWallMs: round(fixtureWallMs),
  thresholds: { d1ServerMaxMs: SERVER_TARGET_MS, cliWallMs: "evidence-only; includes Wrangler startup/network overhead" },
  model: { gamesPerSession: GAMES_PER_SESSION, iterations: ITERATIONS, datasets: datasets.map(({ label, sessions }) => ({ label, sessions, games: sessions * GAMES_PER_SESSION, gameResults: sessions * GAMES_PER_SESSION * 3 })) },
  results: evaluated,
  pass: allPass,
  error: benchmarkError ? String(benchmarkError.stack ?? benchmarkError) : null,
};
writeFileSync(join(artifactDir, "d1-performance-report.json"), JSON.stringify(report, null, 2));

const markdown = [
  "# D1 long-term performance benchmark",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Preview D1 only: ${previewId}`,
  `- Production D1 untouched: ${productionId}`,
  `- Fixture load CLI wall: ${report.fixtureLoadWallMs} ms`,
  `- D1 server target: max <= ${SERVER_TARGET_MS} ms per benchmark invocation`,
  "- CLI wall time is recorded as evidence only because it includes Wrangler process startup and network overhead",
  "",
  "| Data | Benchmark | Sessions | Games | D1 server avg ms | D1 server max ms | CLI wall avg ms | CLI wall max ms | Avg rows read | Result |",
  "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ...evaluated.map((x) => `| ${x.dataset} | ${x.name} | ${x.sessions} | ${x.games} | ${x.serverAvgMs} | ${x.serverMaxMs} | ${x.wallAvgMs} | ${x.wallMaxMs} | ${x.rowsReadAvg} | ${x.pass ? "PASS" : "FAIL"} |`),
  "",
  `**Overall: ${allPass ? "PASS" : "FAIL"}**`,
  benchmarkError ? `\nBenchmark error:\n\n\`\`\`\n${String(benchmarkError.stack ?? benchmarkError)}\n\`\`\`` : "",
  "",
].join("\n");
writeFileSync(join(artifactDir, "d1-performance-report.md"), markdown);
console.log(markdown);
if (!allPass) process.exitCode = 1;
