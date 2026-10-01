from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"anchor not found: {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


# Read model contract.
read_models = Path("src/application/use-cases/read-models.ts")
text = read_models.read_text()
if "export interface PlayerPerformanceDetailAggregate" not in text:
    text = text.rstrip() + """

export interface PlayerPerformanceDetailAggregate {
  readonly playerId: PlayerId;
  readonly sessionCount: number;
  readonly gameCount: number;
  readonly mahjongPointTotal: number;
  readonly chipCountTotal: number;
  readonly chipPointTotal: number;
  readonly finalPointTotal: number;
  readonly placementTotal: number;
  readonly firstPlaceCount: number;
  readonly secondPlaceCount: number;
  readonly thirdPlaceCount: number;
  readonly fourthPlaceCount: number;
  readonly lastPlaceCount: number;
  readonly sessionFirstPlaceCount: number;
}
"""
    read_models.write_text(text)


# Read-only Player detail API. Keep it adjacent to the existing Performance route.
worker_path = Path("src/worker.ts")
worker = worker_path.read_text()
if "const playerPerformanceDetail=url.pathname.match" not in worker:
    anchor = ' const activeSession=url.pathname.match(/^\\/api\\/groups\\/([^/]+)\\/active-session$/);'
    if anchor not in worker:
        raise SystemExit("worker activeSession anchor not found")
    route = r''' const playerPerformanceDetail=url.pathname.match(/^\/api\/groups\/([^/]+)\/players\/([^/]+)\/performance-detail$/);if(request.method==="GET"&&playerPerformanceDetail){const groupId=decodeURIComponent(playerPerformanceDetail[1]),playerId=decodeURIComponent(playerPerformanceDetail[2]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const playerLink=await env.DB.prepare("SELECT 1 AS ok FROM group_players WHERE group_id=? AND player_id=?").bind(groupId,playerId).first<{ok:number}>();if(!playerLink)return bad("player_not_found","Player not found",404);const year=url.searchParams.get("year"),month=url.searchParams.get("month");if(year&&!/^[0-9]{4}$/.test(year))return bad("invalid_performance_period","year must be YYYY");if(month&&(!year||!/^[0-9]{1,2}$/.test(month)||Number(month)<1||Number(month)>12))return bad("invalid_performance_period","month requires a valid year and month");const filters=["s.group_id=?","s.status='finalized'"],bindings:unknown[]=[groupId];if(year){filters.push("substr(s.session_date,1,4)=?");bindings.push(year);}if(month){filters.push("substr(s.session_date,6,2)=?");bindings.push(month.padStart(2,"0"));}const where=filters.join(" AND ");const q=await env.DB.prepare(`WITH selected AS (SELECT s.id,s.chip_rate AS chipRate FROM sessions s WHERE ${where}), participants AS (SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id), game_stats AS (SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal,SUM(gr.placement) AS placementTotal,SUM(CASE WHEN gr.placement=1 THEN 1 ELSE 0 END) AS firstPlaceCount,SUM(CASE WHEN gr.placement=2 THEN 1 ELSE 0 END) AS secondPlaceCount,SUM(CASE WHEN gr.placement=3 THEN 1 ELSE 0 END) AS thirdPlaceCount,SUM(CASE WHEN gr.placement=4 THEN 1 ELSE 0 END) AS fourthPlaceCount,SUM(CASE WHEN gr.is_last=1 THEN 1 ELSE 0 END) AS lastPlaceCount FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id GROUP BY g.session_id,gr.player_id), session_scores AS (SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(gs.placementTotal,0) AS placementTotal,COALESCE(gs.firstPlaceCount,0) AS firstPlaceCount,COALESCE(gs.secondPlaceCount,0) AS secondPlaceCount,COALESCE(gs.thirdPlaceCount,0) AS thirdPlaceCount,COALESCE(gs.fourthPlaceCount,0) AS fourthPlaceCount,COALESCE(gs.lastPlaceCount,0) AS lastPlaceCount,COALESCE(cr.chip_count,0) AS chipCount,COALESCE(cr.chip_count,0)*sel.chipRate AS chipPoint,COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*sel.chipRate AS finalPoint FROM participants p JOIN selected sel ON sel.id=p.session_id LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id), ranked AS (SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores) SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(chipCount) AS chipCountTotal,SUM(chipPoint) AS chipPointTotal,SUM(finalPoint) AS finalPointTotal,SUM(placementTotal) AS placementTotal,SUM(firstPlaceCount) AS firstPlaceCount,SUM(secondPlaceCount) AS secondPlaceCount,SUM(thirdPlaceCount) AS thirdPlaceCount,SUM(fourthPlaceCount) AS fourthPlaceCount,SUM(lastPlaceCount) AS lastPlaceCount,SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS sessionFirstPlaceCount FROM ranked WHERE player_id=? GROUP BY player_id`).bind(...bindings,playerId).all();const performance=(q.results[0] as Record<string,unknown>|undefined)??{playerId,sessionCount:0,gameCount:0,mahjongPointTotal:0,chipCountTotal:0,chipPointTotal:0,finalPointTotal:0,placementTotal:0,firstPlaceCount:0,secondPlaceCount:0,thirdPlaceCount:0,fourthPlaceCount:0,lastPlaceCount:0,sessionFirstPlaceCount:0};return json({performance});}
'''
    worker_path.write_text(worker.replace(anchor, route + anchor, 1))


# App navigation: Performance remains compact; only Player name becomes the detail link.
replace_once(
    "src/App.tsx",
    'import { FinalizedGameCorrection } from "./components/finalized-game-correction";',
    'import { FinalizedGameCorrection } from "./components/finalized-game-correction";\nimport { PlayerPerformanceDetail } from "./components/player-performance-detail";',
)
replace_once(
    "src/App.tsx",
    'type View = "home" | "session-setup" | "results" | "history" | "performance" | "members" | "groups" | "rules";',
    'type View = "home" | "session-setup" | "results" | "history" | "performance" | "player-performance" | "members" | "groups" | "rules";',
)
replace_once(
    "src/App.tsx",
    '  const [performance,setPerformance]=useState<readonly PlayerPerformanceAggregate[]>([]);',
    '  const [performance,setPerformance]=useState<readonly PlayerPerformanceAggregate[]>([]);\n  const [performancePlayerId,setPerformancePlayerId]=useState<string|null>(null);',
)
replace_once(
    "src/App.tsx",
    'setAppAuth(null);setIsLoading(false);setGroup(null);setGroups([]);setPlayers([]);setActiveSession(null);setGames([]);setHistory([]);setPerformance([]);',
    'setAppAuth(null);setIsLoading(false);setGroup(null);setGroups([]);setPlayers([]);setActiveSession(null);setGames([]);setHistory([]);setPerformance([]);setPerformancePlayerId(null);',
)
replace_once(
    "src/App.tsx",
    'const switchGroup=async(groupId:string)=>{if(groupId===group?.id)return;setSessionResults(null);setHistory([]);setHistoryGameCounts({});setPerformance([]);setStatusMessage(null);setErrorMessage(null);setView("home");await refresh(groupId);};',
    'const switchGroup=async(groupId:string)=>{if(groupId===group?.id)return;setSessionResults(null);setHistory([]);setHistoryGameCounts({});setPerformance([]);setPerformancePlayerId(null);setStatusMessage(null);setErrorMessage(null);setView("home");await refresh(groupId);};',
)
replace_once(
    "src/App.tsx",
    'const openPerformance=async()=>{setPerformancePeriod("all");await loadPerformance("all");};',
    'const openPerformance=async()=>{setPerformancePlayerId(null);setPerformancePeriod("all");await loadPerformance("all");};',
)
replace_once(
    "src/App.tsx",
    '<article className="performance-card" key={a.playerId}><div><span className="performance-card__rank">{index+1}</span><strong>{playerNameById(a.playerId)}</strong></div><dl>',
    '<article className="performance-card" key={a.playerId}><div><span className="performance-card__rank">{index+1}</span><button className="performance-card__player-link" type="button" onClick={()=>{setPerformancePlayerId(a.playerId);setView("player-performance");}}><strong>{playerNameById(a.playerId)}</strong></button></div><dl>',
)
replace_once(
    "src/App.tsx",
    '      view==="performance"&&group?<section className="session-setup">',
    '      view==="player-performance"&&group&&performancePlayerId?<PlayerPerformanceDetail groupId={group.id} playerId={performancePlayerId} playerName={playerNameById(performancePlayerId)} initialPeriod={performancePeriod} initialYear={performanceYear} initialMonth={performanceMonth} onBack={()=>setView("performance")}/>:\n      view==="performance"&&group?<section className="session-setup">',
)
