import fs from "node:fs";

const replaceOnce = (file, before, after, label) => {
  const current = fs.readFileSync(file, "utf8");
  const first = current.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source text not found in ${file}`);
  if (current.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source text is not unique in ${file}`);
  }
  fs.writeFileSync(file, current.slice(0, first) + after + current.slice(first + before.length));
};

replaceOnce(
  "src/worker.ts",
  'import { DEFAULT_MAHJONG_RULES, CHIP_COUNT_ABS_MAX, GAME_SCORE_ABS_MAX, GROUP_NAME_MAX_LENGTH, PLAYER_NAME_MAX_LENGTH, SESSION_NOTE_MAX_LENGTH } from "./domain";',
  'import { DEFAULT_MAHJONG_RULES, CHIP_COUNT_ABS_MAX, GAME_SCORE_ABS_MAX, GROUP_NAME_MAX_LENGTH, PLAYER_NAME_MAX_LENGTH, SESSION_NOTE_MAX_LENGTH, deriveGameResultPlacements } from "./domain";',
  "worker domain import",
);

replaceOnce(
  "src/worker.ts",
  'const q=await env.DB.prepare(`WITH selected AS (SELECT s.id FROM sessions s WHERE ${where}), participants AS (SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id), game_stats AS (SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id GROUP BY g.session_id,gr.player_id), session_scores AS (SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(cr.chip_count,0) AS chipCount,COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*s.chip_rate AS finalPoint FROM participants p JOIN sessions s ON s.id=p.session_id LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id), ranked AS (SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores) SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(finalPoint) AS finalPointTotal,SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS firstPlaceCount FROM ranked GROUP BY player_id ORDER BY finalPointTotal DESC`).bind(...bindings).all();',
  'const q=await env.DB.prepare(`WITH selected AS (SELECT s.id FROM sessions s WHERE ${where}), participants AS (SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id), game_stats AS (SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal,SUM(CASE WHEN gr.placement=1 THEN 1 ELSE 0 END) AS gameFirstPlaceCount FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id GROUP BY g.session_id,gr.player_id), session_scores AS (SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(gs.gameFirstPlaceCount,0) AS gameFirstPlaceCount,COALESCE(cr.chip_count,0) AS chipCount,COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*s.chip_rate AS finalPoint FROM participants p JOIN sessions s ON s.id=p.session_id LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id), ranked AS (SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores) SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(finalPoint) AS finalPointTotal,SUM(gameFirstPlaceCount) AS gameFirstPlaceCount,SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS sessionFirstPlaceCount FROM ranked GROUP BY player_id ORDER BY finalPointTotal DESC`).bind(...bindings).all();',
  "performance aggregate query",
);

const postValidation = 'if(parsed.some(v=>!v.playerId||v.scorePoint===null||Math.abs(v.scorePoint)>GAME_SCORE_ABS_MAX)||![3,4].includes(parsed.length)||new Set(parsed.map(v=>v.playerId)).size!==parsed.length||parsed.reduce((n,v)=>n+(v.scorePoint??0),0)!==0)return bad("invalid_game_results","Game results must contain 3 or 4 unique players with integer points totaling zero");';
const postValidationWithPlacement = postValidation + 'const placements=deriveGameResultPlacements(parsed.map(v=>({playerId:v.playerId as string,scorePoint:v.scorePoint as number})));if(!placements)return bad("invalid_game_first_place_tie","Highest Score Point must be unique",400);const placementByPlayer=new Map(placements.map(v=>[v.playerId,v]));';
replaceOnce("src/worker.ts", postValidation, postValidationWithPlacement, "POST Game placement validation");

replaceOnce(
  "src/worker.ts",
  '...parsed.map(v=>env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM games WHERE id=?)").bind(id,v.playerId,v.rank,v.scorePoint,id))',
  '...parsed.map(v=>{const placement=placementByPlayer.get(v.playerId as string)!;return env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM games WHERE id=?)").bind(id,v.playerId,v.rank,v.scorePoint,placement.placement,placement.isLast?1:0,id);})',
  "POST Game persisted placement",
);

const putValidation = 'if(!segmentId||!playedAt||!Number.isInteger(sequence)||expectedVersion===null||![3,4].includes(parsed.length)||parsed.some(v=>!v.playerId||v.scorePoint===null||Math.abs(v.scorePoint)>GAME_SCORE_ABS_MAX)||new Set(parsed.map(v=>v.playerId)).size!==parsed.length||parsed.reduce((n,v)=>n+(v.scorePoint??0),0)!==0||parsedTags.some(v=>!v.type))return bad("invalid_game","Game payload is invalid");';
const putValidationWithPlacement = putValidation + 'const placements=deriveGameResultPlacements(parsed.map(v=>({playerId:v.playerId as string,scorePoint:v.scorePoint as number})));if(!placements)return bad("invalid_game_first_place_tie","Highest Score Point must be unique",400);const placementByPlayer=new Map(placements.map(v=>[v.playerId,v]));';
replaceOnce("src/worker.ts", putValidation, putValidationWithPlacement, "PUT Game placement validation");

replaceOnce(
  "src/worker.ts",
  '...parsed.map(v=>env.DB.prepare(`INSERT INTO game_results(game_id,player_id,rank,score_point) SELECT ?,?,?,? WHERE ${activeVersionSql}`).bind(gameId,v.playerId,v.rank,v.scorePoint,gameId,expectedVersion)),',
  '...parsed.map(v=>{const placement=placementByPlayer.get(v.playerId as string)!;return env.DB.prepare(`INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last) SELECT ?,?,?,?,?,? WHERE ${activeVersionSql}`).bind(gameId,v.playerId,v.rank,v.scorePoint,placement.placement,placement.isLast?1:0,gameId,expectedVersion);}),',
  "PUT Game persisted placement",
);

replaceOnce(
  "src/worker.ts",
  '   for(const g of data.games){\n     statements.push(env.DB.prepare("INSERT INTO games(id,session_id,segment_id,sequence,played_at) VALUES(?,?,?,?,?)").bind(g.id,g.sessionId,g.segmentId,g.sequence,g.playedAt));\n     g.results.forEach((r,i)=>statements.push(env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point) VALUES(?,?,?,?)").bind(g.id,r.playerId,i+1,r.scorePoint)));\n     g.tags.forEach((t,i)=>statements.push(env.DB.prepare("INSERT INTO game_tags(game_id,tag_order,type,player_id) VALUES(?,?,?,?)").bind(g.id,i+1,t.type,t.playerId)));\n   }',
  '   for(const g of data.games){\n     const placements=deriveGameResultPlacements(g.results);\n     if(!placements)return bad("invalid_app_data","Migrated Game results must have a unique first-place Score Point",400);\n     const placementByPlayer=new Map(placements.map(v=>[v.playerId,v]));\n     statements.push(env.DB.prepare("INSERT INTO games(id,session_id,segment_id,sequence,played_at) VALUES(?,?,?,?,?)").bind(g.id,g.sessionId,g.segmentId,g.sequence,g.playedAt));\n     g.results.forEach((r,i)=>{const placement=placementByPlayer.get(r.playerId)!;statements.push(env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point,placement,is_last) VALUES(?,?,?,?,?,?)").bind(g.id,r.playerId,i+1,r.scorePoint,placement.placement,placement.isLast?1:0));});\n     g.tags.forEach((t,i)=>statements.push(env.DB.prepare("INSERT INTO game_tags(game_id,tag_order,type,player_id) VALUES(?,?,?,?)").bind(g.id,i+1,t.type,t.playerId)));\n   }',
  "legacy local migration placement",
);

replaceOnce(
  "src/App.tsx",
  'const formatScore = (value:number):string => (value > 0 ? "+" : "") + value;\nconst numberClass = (value:number):string => value < 0 ? "number--negative" : "";',
  'const formatScore = (value:number):string => (value > 0 ? "+" : "") + value;\nconst formatPercent = (value:number):string => `${Number.isInteger(value)?value.toFixed(0):value.toFixed(1)}%`;\nconst numberClass = (value:number):string => value < 0 ? "number--negative" : "";',
  "Performance percent formatter",
);

const oldPerformanceList = '<div className="performance-list">{performance.map((a,index)=><article className="performance-card" key={a.playerId}><div><span className="performance-card__rank">{index+1}</span><strong>{playerNameById(a.playerId)}</strong></div><dl><div className="performance-card__points"><dt>最終pt</dt><dd className={numberClass(a.finalPointTotal)}>{formatScore(a.finalPointTotal)}</dd><small>（麻雀 <span className={numberClass(a.mahjongPointTotal)}>{formatScore(a.mahjongPointTotal)}</span> / チップ <span className={numberClass(a.finalPointTotal-a.mahjongPointTotal)}>{formatScore(a.finalPointTotal-a.mahjongPointTotal)}</span>）</small></div><div><dt>1位</dt><dd>{a.firstPlaceCount}回</dd></div><div><dt>Session</dt><dd>{a.sessionCount}回</dd></div><div><dt>半荘</dt><dd>{a.gameCount}回</dd></div></dl></article>)}</div>';
const newPerformanceList = '<div className="performance-list">{performance.map((a,index)=>{const average=a.gameCount===0?0:a.mahjongPointTotal/a.gameCount;const gameWinRate=a.gameCount===0?0:a.gameFirstPlaceCount/a.gameCount*100;const sessionWinRate=a.sessionCount===0?0:a.sessionFirstPlaceCount/a.sessionCount*100;return <article className="performance-card" key={a.playerId}><div><span className="performance-card__rank">{index+1}</span><strong>{playerNameById(a.playerId)}</strong></div><dl><div className="performance-card__points"><dt>最終pt</dt><dd className={numberClass(a.finalPointTotal)}>{formatScore(a.finalPointTotal)}</dd><small>（麻雀 <span className={numberClass(a.mahjongPointTotal)}>{formatScore(a.mahjongPointTotal)}</span> / チップ <span className={numberClass(a.finalPointTotal-a.mahjongPointTotal)}>{formatScore(a.finalPointTotal-a.mahjongPointTotal)}</span>）</small></div><div className="performance-card__metric"><dt>平均</dt><dd className={numberClass(average)}>{average>0?"+":""}{average.toFixed(1)}</dd></div><div className="performance-card__metric"><dt>半荘勝率</dt><dd>{formatPercent(gameWinRate)}<small>{a.gameFirstPlaceCount}/{a.gameCount}</small></dd></div><div className="performance-card__metric"><dt>Session勝率</dt><dd>{formatPercent(sessionWinRate)}<small>{a.sessionFirstPlaceCount}/{a.sessionCount}</small></dd></div></dl></article>})}</div>';
replaceOnce("src/App.tsx", oldPerformanceList, newPerformanceList, "Performance card metrics");

console.log("Issue #299 scoped codemod applied successfully.");
