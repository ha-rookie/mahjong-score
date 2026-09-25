import { validateAppDataSchema } from "./infrastructure/storage/app-data-schema";
import { authMe, authenticatedUserId, bootstrapAdmin, finishLineLogin, logout, startLineLogin } from "./worker/auth/line-login";
import { requestCorrelationId, writeAuditLog } from "./worker/audit";
interface Env { DB: D1Database; ASSETS: Fetcher; LINE_CHANNEL_ID?: string; LINE_CHANNEL_SECRET?: string; AUTH_SESSION_SECRET?: string; }
const json=(data:unknown,init:ResponseInit={})=>new Response(JSON.stringify(data),{...init,headers:{"content-type":"application/json; charset=utf-8",...init.headers}});
const bad=(code:string,message:string,status=400)=>json({error:{code,message}},{status});
const body=async(request:Request)=>{try{return await request.json() as Record<string,unknown>}catch{return null}};
const textValue=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
const enc=new TextEncoder();
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const invitationToken=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const invitationTokenHash=async(value:string)=>base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))));
const groupRole=async(env:Env,userId:string,groupId:string)=>env.DB.prepare("SELECT role FROM group_memberships WHERE user_id=? AND group_id=?").bind(userId,groupId).first<{role:"group_admin"|"member"}>();
const isSystemAdmin=async(env:Env,userId:string)=>(await env.DB.prepare("SELECT 1 AS ok FROM users WHERE id=? AND system_role='admin'").bind(userId).first<{ok:number}>())?.ok===1;
const canUseGroup=async(env:Env,userId:string,groupId:string)=>await isSystemAdmin(env,userId)||Boolean(await groupRole(env,userId,groupId));
const sessionGroup=async(env:Env,sessionId:string)=>env.DB.prepare("SELECT group_id AS groupId FROM sessions WHERE id=?").bind(sessionId).first<{groupId:string}>();
const canInvite=async(env:Env,userId:string,groupId:string)=>await isSystemAdmin(env,userId)||(await groupRole(env,userId,groupId))?.role==="group_admin";
export default { async fetch(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),requestId=requestCorrelationId(request); if(!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request); if(request.method==="GET"&&url.pathname==="/api/auth/line/start")return startLineLogin(request,env); if(request.method==="GET"&&url.pathname==="/api/auth/line/callback")return finishLineLogin(request,env); if(request.method==="GET"&&url.pathname==="/api/auth/me")return authMe(request,env); if(request.method==="POST"&&url.pathname==="/api/auth/logout")return logout(); if(request.method==="POST"&&url.pathname==="/api/auth/bootstrap-admin")return bootstrapAdmin(request,env);
 if(request.method==="GET"&&url.pathname==="/api/health"){const row=await env.DB.prepare("SELECT 1 AS ok").first<{ok:number}>();return json({ok:row?.ok===1});}
 const authUserId=await authenticatedUserId(request,env);if(!authUserId){writeAuditLog({event:"authentication_failure",requestId,method:request.method,path:url.pathname,outcome:"failure",reason:"session_missing_or_invalid"});return bad("unauthorized","Authentication required",401);}
 const deny=(message:string)=>{writeAuditLog({event:"authorization_failure",requestId,method:request.method,path:url.pathname,outcome:"failure",userId:authUserId,reason:message});return bad("forbidden",message,403);};
 const auditSuccess=(event:string,fields:{groupId?:string|null;resourceType?:string;resourceId?:string|null}={})=>writeAuditLog({event,requestId,method:request.method,path:url.pathname,outcome:"success",userId:authUserId,...fields});
 if(request.method==="GET"&&url.pathname==="/api/groups"){const r=await isSystemAdmin(env,authUserId)?await env.DB.prepare("SELECT id,name,created_at AS createdAt,updated_at AS updatedAt,NULL AS role FROM groups ORDER BY created_at,id").all():await env.DB.prepare("SELECT g.id,g.name,g.created_at AS createdAt,g.updated_at AS updatedAt,gm.role FROM groups g JOIN group_memberships gm ON gm.group_id=g.id WHERE gm.user_id=? ORDER BY g.created_at,g.id").bind(authUserId).all();return json({groups:r.results});}
 if(request.method==="POST"&&url.pathname==="/api/groups"){if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");const b=await body(request),id=textValue(b?.id),name=textValue(b?.name),createdAt=textValue(b?.createdAt),updatedAt=textValue(b?.updatedAt);if(!id||!name||!createdAt||!updatedAt)return bad("invalid_group","id, name, createdAt and updatedAt are required");try{await env.DB.prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(id,name,createdAt,updatedAt).run();auditSuccess("group_created",{groupId:id,resourceType:"group",resourceId:id});return json({group:{id,name,createdAt,updatedAt}},{status:201});}catch{return bad("group_write_failed","Group could not be created",409);}}
 const m=url.pathname.match(/^\/api\/groups\/([^/]+)\/players$/);if(request.method==="GET"&&m){const groupId=decodeURIComponent(m[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const r=await env.DB.prepare("SELECT p.id,p.display_name AS displayName,p.created_at AS createdAt,p.updated_at AS updatedAt,gp.user_id AS userId,u.display_name AS linkedUserDisplayName,gm.role AS groupRole FROM players p JOIN group_players gp ON gp.player_id=p.id LEFT JOIN users u ON u.id=gp.user_id LEFT JOIN group_memberships gm ON gm.group_id=gp.group_id AND gm.user_id=gp.user_id WHERE gp.group_id=? AND gp.active=1 ORDER BY p.created_at,p.id").bind(groupId).all();return json({players:r.results});}
 if(request.method==="POST"&&m){const groupId=decodeURIComponent(m[1]);if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");const b=await body(request),id=textValue(b?.id),displayName=textValue(b?.displayName),createdAt=textValue(b?.createdAt),updatedAt=textValue(b?.updatedAt);if(!id||!displayName||!createdAt||!updatedAt)return bad("invalid_player","id, displayName, createdAt and updatedAt are required");try{await env.DB.batch([env.DB.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(id,displayName,createdAt,updatedAt),env.DB.prepare("INSERT INTO group_players(group_id,player_id,active) VALUES(?,?,1)").bind(groupId,id)]);auditSuccess("player_created",{groupId,resourceType:"player",resourceId:id});return json({player:{id,displayName,createdAt,updatedAt}},{status:201});}catch{return bad("player_write_failed","Player could not be created",409);}}

 const historySummary=url.pathname.match(/^\/api\/groups\/([^/]+)\/history-summary$/);if(request.method==="GET"&&historySummary){const groupId=decodeURIComponent(historySummary[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const year=url.searchParams.get("year"),month=url.searchParams.get("month");if(!year||!month||!/^[0-9]{4}$/.test(year)||!/^[0-9]{1,2}$/.test(month)||Number(month)<1||Number(month)>12)return bad("invalid_history_period","year and month are required");const ym=`${year}-${month.padStart(2,"0")}`;const q=await env.DB.prepare("SELECT s.id,s.group_id AS groupId,s.session_date AS sessionDate,s.started_at AS startedAt,s.ended_at AS endedAt,s.status,s.note,s.version,(SELECT COUNT(*) FROM games g WHERE g.session_id=s.id) AS gameCount FROM sessions s WHERE s.group_id=? AND s.status='finalized' AND substr(s.session_date,1,7)=? ORDER BY s.session_date DESC,COALESCE(s.ended_at,s.started_at) DESC,s.id DESC").bind(groupId,ym).all();const sessionIds=(q.results as Array<Record<string,unknown>>).map(s=>String(s.id));if(!sessionIds.length)return json({sessions:[]});const placeholders=sessionIds.map(()=>"?").join(",");const [notes,chips]=await Promise.all([env.DB.prepare(`SELECT session_id AS sessionId,player_id AS playerId,note FROM session_participant_notes WHERE session_id IN (${placeholders}) ORDER BY player_id`).bind(...sessionIds).all(),env.DB.prepare(`SELECT session_id AS sessionId,player_id AS playerId,chip_count AS chipCount FROM chip_results WHERE session_id IN (${placeholders}) ORDER BY player_id`).bind(...sessionIds).all()]);return json({sessions:(q.results as Array<Record<string,unknown>>).map(s=>({...s,participantNotes:notes.results.filter(n=>n.sessionId===s.id).map(n=>({playerId:n.playerId,note:n.note})),chipResults:chips.results.filter(c=>c.sessionId===s.id).map(c=>({playerId:c.playerId,chipCount:c.chipCount}))}))});}
 const performanceSummary=url.pathname.match(/^\/api\/groups\/([^/]+)\/performance-summary$/);if(request.method==="GET"&&performanceSummary){const groupId=decodeURIComponent(performanceSummary[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const year=url.searchParams.get("year"),month=url.searchParams.get("month");const filters=["s.group_id=?","s.status='finalized'"],bindings:unknown[]=[groupId];if(year){filters.push("substr(s.session_date,1,4)=?");bindings.push(year);}if(month){filters.push("substr(s.session_date,6,2)=?");bindings.push(month.padStart(2,"0"));}const where=filters.join(" AND ");const q=await env.DB.prepare(`WITH selected AS (SELECT s.id FROM sessions s WHERE ${where}), participants AS (SELECT DISTINCT ps.session_id,sp.player_id FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id JOIN selected sel ON sel.id=ps.session_id), game_stats AS (SELECT g.session_id,gr.player_id,COUNT(*) AS gameCount,SUM(gr.score_point) AS mahjongPointTotal FROM games g JOIN game_results gr ON gr.game_id=g.id JOIN selected sel ON sel.id=g.session_id GROUP BY g.session_id,gr.player_id), session_scores AS (SELECT p.session_id,p.player_id,COALESCE(gs.gameCount,0) AS gameCount,COALESCE(gs.mahjongPointTotal,0) AS mahjongPointTotal,COALESCE(cr.chip_count,0) AS chipCount,COALESCE(gs.mahjongPointTotal,0)+COALESCE(cr.chip_count,0)*5 AS finalPoint FROM participants p LEFT JOIN game_stats gs ON gs.session_id=p.session_id AND gs.player_id=p.player_id LEFT JOIN chip_results cr ON cr.session_id=p.session_id AND cr.player_id=p.player_id), ranked AS (SELECT *,MAX(finalPoint) OVER(PARTITION BY session_id) AS best FROM session_scores) SELECT player_id AS playerId,COUNT(*) AS sessionCount,SUM(gameCount) AS gameCount,SUM(mahjongPointTotal) AS mahjongPointTotal,SUM(finalPoint) AS finalPointTotal,SUM(CASE WHEN finalPoint=best THEN 1 ELSE 0 END) AS firstPlaceCount FROM ranked GROUP BY player_id ORDER BY finalPointTotal DESC`).bind(...bindings).all();return json({performance:q.results});}
 const sessions=url.pathname.match(/^\/api\/groups\/([^/]+)\/sessions$/);if(request.method==="GET"&&sessions){const groupId=decodeURIComponent(sessions[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const q=await env.DB.prepare("SELECT id,group_id AS groupId,session_date AS sessionDate,started_at AS startedAt,ended_at AS endedAt,status,note,version FROM sessions WHERE group_id=? ORDER BY started_at,id").bind(groupId).all();const result=[];for(const s of q.results as Array<Record<string,unknown>>){const notes=await env.DB.prepare("SELECT player_id AS playerId,note FROM session_participant_notes WHERE session_id=? ORDER BY player_id").bind(s.id).all();const chips=await env.DB.prepare("SELECT player_id AS playerId,chip_count AS chipCount FROM chip_results WHERE session_id=? ORDER BY player_id").bind(s.id).all();result.push({...s,participantNotes:notes.results,chipResults:chips.results});}return json({sessions:result});} if(request.method==="POST"&&sessions){const groupId=decodeURIComponent(sessions[1]);if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");const b=await body(request),id=textValue(b?.id),segmentId=textValue(b?.segmentId),sessionDate=textValue(b?.sessionDate),startedAt=textValue(b?.startedAt),participants=Array.isArray(b?.participantPlayerIds)?b.participantPlayerIds.filter((v):v is string=>typeof v==="string"):[];if(!id||!segmentId||!sessionDate||!startedAt||![3,4].includes(participants.length)||new Set(participants).size!==participants.length)return bad("invalid_session","Session and 3 or 4 unique participants are required");const now=startedAt;try{const statements=[env.DB.prepare("INSERT INTO sessions(id,group_id,session_date,started_at,status,created_at,updated_at) VALUES(?,?,?,?,'active',?,?)").bind(id,groupId,sessionDate,startedAt,now,now),env.DB.prepare("INSERT INTO participant_segments(id,session_id,sequence) VALUES(?,?,1)").bind(segmentId,id),...participants.map((playerId,i)=>env.DB.prepare("INSERT INTO segment_players(segment_id,player_id,seat_order) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND active=1)").bind(segmentId,playerId,i,groupId,playerId))];const rs=await env.DB.batch(statements);if(rs.slice(2).some(v=>v.meta.changes!==1))throw new Error("participant");return json({session:{id,groupId,sessionDate,startedAt,status:"active",participantPlayerIds:participants}},{status:201});}catch{return bad("session_write_failed","Session could not be created",409);}}
 const games=url.pathname.match(/^\/api\/sessions\/([^/]+)\/games$/);if(request.method==="GET"&&games){const sessionId=decodeURIComponent(games[1]),sg=await sessionGroup(env,sessionId);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const q=await env.DB.prepare("SELECT id,session_id AS sessionId,segment_id AS segmentId,sequence,played_at AS playedAt,version FROM games WHERE session_id=? ORDER BY sequence,id").bind(sessionId).all();const result=[];for(const g of q.results as Array<Record<string,unknown>>){const rr=await env.DB.prepare("SELECT player_id AS playerId,score_point AS scorePoint FROM game_results WHERE game_id=? ORDER BY rank").bind(g.id).all();const tt=await env.DB.prepare("SELECT type,player_id AS playerId FROM game_tags WHERE game_id=? ORDER BY tag_order").bind(g.id).all();result.push({...g,results:rr.results,tags:tt.results});}return json({games:result});}if(request.method==="POST"&&games){const sessionId=decodeURIComponent(games[1]),sg=await sessionGroup(env,sessionId);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const b=await body(request),id=textValue(b?.id),segmentId=textValue(b?.segmentId),playedAt=textValue(b?.playedAt),sequence=typeof b?.sequence==="number"?b.sequence:null,results=Array.isArray(b?.results)?b.results:[];if(!id||!segmentId||!playedAt||!Number.isInteger(sequence)||!results.length)return bad("invalid_game","Game fields and results are required");const parsed=results.map((v,i)=>{const o=v&&typeof v==="object"?v as Record<string,unknown>:{};return {playerId:textValue(o.playerId),scorePoint:typeof o.scorePoint==="number"&&Number.isInteger(o.scorePoint)?o.scorePoint:null,rank:i+1}});if(parsed.some(v=>!v.playerId||v.scorePoint===null)||![3,4].includes(parsed.length)||new Set(parsed.map(v=>v.playerId)).size!==parsed.length||parsed.reduce((n,v)=>n+(v.scorePoint??0),0)!==0)return bad("invalid_game_results","Game results must contain 3 or 4 unique players with integer points totaling zero");const segment=await env.DB.prepare("SELECT id FROM participant_segments WHERE id=? AND session_id=?").bind(segmentId,sessionId).first();if(!segment)return bad("invalid_game_segment","Segment must belong to the Session");const segmentPlayers=await env.DB.prepare("SELECT player_id AS playerId FROM segment_players WHERE segment_id=? ORDER BY seat_order").bind(segmentId).all();const expectedPlayers=(segmentPlayers.results as Array<{playerId:string}>).map(v=>v.playerId);const actualPlayers=parsed.map(v=>v.playerId as string);if(![3,4].includes(expectedPlayers.length)||expectedPlayers.length!==actualPlayers.length||expectedPlayers.some(id=>!actualPlayers.includes(id)))return bad("invalid_game_participants","Game results must match the Session participants");try{const rs=await env.DB.batch([env.DB.prepare("INSERT INTO games(id,session_id,segment_id,sequence,played_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND status='active')").bind(id,sessionId,segmentId,sequence,playedAt,sessionId),...parsed.map(v=>env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM games WHERE id=?)").bind(id,v.playerId,v.rank,v.scorePoint,id))]);if(rs[0]?.meta.changes!==1||rs.slice(1).some(v=>v.meta.changes!==1))throw new Error("game_write_incomplete");return json({game:{id,sessionId,segmentId,sequence,playedAt,results:parsed}},{status:201});}catch{return bad("game_write_failed","Game could not be created",409);}}
 const segments=url.pathname.match(/^\/api\/sessions\/([^/]+)\/segments$/);if(request.method==="GET"&&segments){const sessionId=decodeURIComponent(segments[1]),sg=await sessionGroup(env,sessionId);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const q=await env.DB.prepare("SELECT id,session_id AS sessionId,sequence FROM participant_segments WHERE session_id=? ORDER BY sequence,id").bind(sessionId).all();const result=[];for(const s of q.results as Array<Record<string,unknown>>){const pp=await env.DB.prepare("SELECT player_id AS playerId FROM segment_players WHERE segment_id=? ORDER BY seat_order").bind(s.id).all();result.push({...s,participantPlayerIds:pp.results.map(v=>v.playerId)});}return json({segments:result});}
 const details=url.pathname.match(/^\/api\/sessions\/([^/]+)$/);if(request.method==="GET"&&details){const id=decodeURIComponent(details[1]),sg=await sessionGroup(env,id);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const s=await env.DB.prepare("SELECT id,group_id AS groupId,session_date AS sessionDate,started_at AS startedAt,ended_at AS endedAt,status,note,version FROM sessions WHERE id=?").bind(id).first();if(!s)return bad("session_not_found","Session not found",404);const n=await env.DB.prepare("SELECT player_id AS playerId,note FROM session_participant_notes WHERE session_id=? ORDER BY player_id").bind(id).all();const c=await env.DB.prepare("SELECT player_id AS playerId,chip_count AS chipCount FROM chip_results WHERE session_id=? ORDER BY player_id").bind(id).all();return json({session:{...s,participantNotes:n.results,chipResults:c.results}});}if(request.method==="PATCH"&&details){const id=decodeURIComponent(details[1]),sg=await sessionGroup(env,id);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const b=await body(request),note=b?.note===null?null:typeof b?.note==="string"?b.note:null,status=b?.status==="finalized"?"finalized":"active",endedAt=b?.endedAt===null?null:textValue(b?.endedAt),updatedAt=textValue(b?.updatedAt),expectedVersion=typeof b?.expectedVersion==="number"&&Number.isInteger(b.expectedVersion)&&b.expectedVersion>0?b.expectedVersion:null;if(!updatedAt||expectedVersion===null)return bad("invalid_session_update","updatedAt and expectedVersion are required");const participantNotes=Array.isArray(b?.participantNotes)?b.participantNotes:[],chipResults=Array.isArray(b?.chipResults)?b.chipResults:[];const notes=participantNotes.map(v=>{const o=v&&typeof v==="object"?v as Record<string,unknown>:{};return {playerId:textValue(o.playerId),note:typeof o.note==="string"?o.note:null}}),chips=chipResults.map(v=>{const o=v&&typeof v==="object"?v as Record<string,unknown>:{};return {playerId:textValue(o.playerId),chipCount:typeof o.chipCount==="number"&&Number.isInteger(o.chipCount)?o.chipCount:null}});if(notes.some(v=>!v.playerId||v.note===null)||chips.some(v=>!v.playerId||v.chipCount===null)||new Set(notes.map(v=>v.playerId)).size!==notes.length||new Set(chips.map(v=>v.playerId)).size!==chips.length||chips.reduce((n,v)=>n+(v.chipCount??0),0)!==0)return bad("invalid_session_details","Participant notes/chips are invalid");const participantRows=await env.DB.prepare("SELECT DISTINCT sp.player_id AS playerId FROM participant_segments ps JOIN segment_players sp ON sp.segment_id=ps.id WHERE ps.session_id=?").bind(id).all();const participantIds=(participantRows.results as Array<{playerId:string}>).map(v=>v.playerId);if(!participantIds.length||notes.some(v=>!participantIds.includes(v.playerId as string))||chips.some(v=>!participantIds.includes(v.playerId as string))||(chips.length>0&&(chips.length!==participantIds.length||participantIds.some(playerId=>!chips.some(v=>v.playerId===playerId)))))return bad("invalid_session_participants","Participant notes/chips must belong to the Session and chip results must cover all participants");try{const rs=await env.DB.batch([env.DB.prepare("DELETE FROM session_participant_notes WHERE session_id=? AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND version=?)").bind(id,id,expectedVersion),...notes.map(v=>env.DB.prepare("INSERT INTO session_participant_notes(session_id,player_id,note) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND version=?)").bind(id,v.playerId,v.note,id,expectedVersion)),env.DB.prepare("DELETE FROM chip_results WHERE session_id=? AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND version=?)").bind(id,id,expectedVersion),...chips.map(v=>env.DB.prepare("INSERT INTO chip_results(session_id,player_id,chip_count) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE id=? AND version=?)").bind(id,v.playerId,v.chipCount,id,expectedVersion)),env.DB.prepare("UPDATE sessions SET note=?,status=?,ended_at=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(note,status,endedAt,updatedAt,id,expectedVersion)]);const updated=rs[rs.length-1]?.meta.changes??0;if(updated!==1)return bad("stale_update","Session was updated by another client",409);return json({ok:true,version:expectedVersion+1});}catch{return bad("session_update_failed","Session could not be updated",409);}}
 if(request.method==="POST"&&url.pathname==="/api/admin/migrate-local-v1"){
   if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");
   const b=await body(request),validated=validateAppDataSchema(b?.data);
   if(!validated.ok)return bad("invalid_app_data",validated.error.message,400);
   const existing=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM groups) AS groupsCount,(SELECT COUNT(*) FROM sessions) AS sessionsCount,(SELECT COUNT(*) FROM games) AS gamesCount").first<{groupsCount:number;sessionsCount:number;gamesCount:number}>();
   if((existing?.groupsCount??0)>0||(existing?.sessionsCount??0)>0||(existing?.gamesCount??0)>0)return bad("migration_target_not_empty","D1 gameplay data already exists",409);
   const data=validated.value;
   const statements:D1PreparedStatement[]=[];
   for(const g of data.groups)statements.push(env.DB.prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(g.id,g.name,g.createdAt,g.updatedAt));
   for(const p of data.players)statements.push(env.DB.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(p.id,p.displayName,p.createdAt,p.updatedAt));
   for(const gp of data.groupMembers)statements.push(env.DB.prepare("INSERT INTO group_players(group_id,player_id,active) VALUES(?,?,?)").bind(gp.groupId,gp.playerId,gp.active?1:0));
   for(const s of data.sessions)statements.push(env.DB.prepare("INSERT INTO sessions(id,group_id,session_date,started_at,ended_at,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(s.id,s.groupId,s.sessionDate,s.startedAt,s.endedAt,s.status,s.note,s.startedAt,s.endedAt??s.startedAt));
   for(const seg of data.participantSegments){
     statements.push(env.DB.prepare("INSERT INTO participant_segments(id,session_id,sequence) VALUES(?,?,?)").bind(seg.id,seg.sessionId,seg.sequence));
     seg.participantPlayerIds.forEach((playerId,i)=>statements.push(env.DB.prepare("INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES(?,?,?)").bind(seg.id,playerId,i)));
   }
   for(const s of data.sessions){
     for(const n of s.participantNotes)statements.push(env.DB.prepare("INSERT INTO session_participant_notes(session_id,player_id,note) VALUES(?,?,?)").bind(s.id,n.playerId,n.note));
     for(const cr of s.chipResults)statements.push(env.DB.prepare("INSERT INTO chip_results(session_id,player_id,chip_count) VALUES(?,?,?)").bind(s.id,cr.playerId,cr.chipCount));
   }
   for(const g of data.games){
     statements.push(env.DB.prepare("INSERT INTO games(id,session_id,segment_id,sequence,played_at) VALUES(?,?,?,?,?)").bind(g.id,g.sessionId,g.segmentId,g.sequence,g.playedAt));
     g.results.forEach((r,i)=>statements.push(env.DB.prepare("INSERT INTO game_results(game_id,player_id,rank,score_point) VALUES(?,?,?,?)").bind(g.id,r.playerId,i+1,r.scorePoint)));
     g.tags.forEach((t,i)=>statements.push(env.DB.prepare("INSERT INTO game_tags(game_id,tag_order,type,player_id) VALUES(?,?,?,?)").bind(g.id,i+1,t.type,t.playerId)));
   }
   try{if(statements.length)await env.DB.batch(statements);auditSuccess("local_data_migrated",{resourceType:"migration"});return json({ok:true,counts:{groups:data.groups.length,players:data.players.length,sessions:data.sessions.length,games:data.games.length}});}
   catch{return bad("migration_failed","Local data could not be migrated to D1",409);}
 }
 const gameDetail=url.pathname.match(/^\/api\/games\/([^/]+)$/);
 if(gameDetail){
   const gameId=decodeURIComponent(gameDetail[1]);
   const base=await env.DB.prepare("SELECT g.id,g.session_id AS sessionId,g.segment_id AS segmentId,g.sequence,g.played_at AS playedAt,g.version,s.group_id AS groupId,s.status FROM games g JOIN sessions s ON s.id=g.session_id WHERE g.id=?").bind(gameId).first<Record<string,unknown>>();
   if(!base)return bad("game_not_found","Game not found",404);
   const groupId=String(base.groupId);
   if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");
   if(request.method==="GET"){
     const rr=await env.DB.prepare("SELECT player_id AS playerId,score_point AS scorePoint FROM game_results WHERE game_id=? ORDER BY rank").bind(gameId).all();
     const tt=await env.DB.prepare("SELECT type,player_id AS playerId FROM game_tags WHERE game_id=? ORDER BY tag_order").bind(gameId).all();
      const game={id:base.id,sessionId:base.sessionId,segmentId:base.segmentId,sequence:base.sequence,playedAt:base.playedAt,version:base.version};
     return json({game:{...game,results:rr.results,tags:tt.results}});
   }
   if(request.method==="PUT"){
     if(base.status!=="active")return bad("session_not_active","Finalized Session is read-only",409);
     const b=await body(request),segmentId=textValue(b?.segmentId),playedAt=textValue(b?.playedAt),sequence=typeof b?.sequence==="number"?b.sequence:null,expectedVersion=typeof b?.expectedVersion==="number"&&Number.isInteger(b.expectedVersion)&&b.expectedVersion>0?b.expectedVersion:null,results=Array.isArray(b?.results)?b.results:[],tags=Array.isArray(b?.tags)?b.tags:[];
     const parsed=results.map((v,i)=>{const o=v&&typeof v==="object"?v as Record<string,unknown>:{};return {playerId:textValue(o.playerId),scorePoint:typeof o.scorePoint==="number"&&Number.isInteger(o.scorePoint)?o.scorePoint:null,rank:i+1}});
     const parsedTags=tags.map((v,i)=>{const o=v&&typeof v==="object"?v as Record<string,unknown>:{};return {type:o.type==="yakuman"||o.type==="double-yakuman"?o.type:null,playerId:o.playerId===null?null:textValue(o.playerId),order:i+1}});
     if(!segmentId||!playedAt||!Number.isInteger(sequence)||expectedVersion===null||!parsed.length||parsed.some(v=>!v.playerId||v.scorePoint===null)||parsed.reduce((n,v)=>n+(v.scorePoint??0),0)!==0||parsedTags.some(v=>!v.type))return bad("invalid_game","Game payload is invalid");
     try{
       const activeVersionSql="EXISTS(SELECT 1 FROM games gx JOIN sessions sx ON sx.id=gx.session_id WHERE gx.id=? AND gx.version=? AND sx.status='active')";
       const rs=await env.DB.batch([
         env.DB.prepare(`DELETE FROM game_results WHERE game_id=? AND ${activeVersionSql}`).bind(gameId,gameId,expectedVersion),
         ...parsed.map(v=>env.DB.prepare(`INSERT INTO game_results(game_id,player_id,rank,score_point) SELECT ?,?,?,? WHERE ${activeVersionSql}`).bind(gameId,v.playerId,v.rank,v.scorePoint,gameId,expectedVersion)),
         env.DB.prepare(`DELETE FROM game_tags WHERE game_id=? AND ${activeVersionSql}`).bind(gameId,gameId,expectedVersion),
         ...parsedTags.map(v=>env.DB.prepare(`INSERT INTO game_tags(game_id,tag_order,type,player_id) SELECT ?,?,?,? WHERE ${activeVersionSql}`).bind(gameId,v.order,v.type,v.playerId,gameId,expectedVersion)),
         env.DB.prepare("UPDATE games SET segment_id=?,sequence=?,played_at=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM sessions WHERE id=games.session_id AND status='active')").bind(segmentId,sequence,playedAt,gameId,expectedVersion),
       ]);
       const updated=rs[rs.length-1]?.meta.changes??0;if(updated!==1)return bad("stale_update","Game was updated by another client",409);
       return json({ok:true,version:expectedVersion+1});
     }catch{return bad("game_update_failed","Game could not be updated",409);}
   }
   if(request.method==="DELETE"){
     if(base.status!=="active")return bad("session_not_active","Finalized Session is read-only",409);
     const versionRaw=url.searchParams.get("version"),expectedVersion=versionRaw&&/^[0-9]+$/.test(versionRaw)?Number(versionRaw):null;
     if(expectedVersion===null||expectedVersion<1)return bad("invalid_expected_version","version is required");
     const deleted=await env.DB.prepare("DELETE FROM games WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM sessions WHERE id=games.session_id AND status='active')").bind(gameId,expectedVersion).run();
     if((deleted.meta.changes??0)!==1)return bad("stale_update","Game was updated by another client",409);
     return new Response(null,{status:204});
   }
 }
 const sessionGames=url.pathname.match(/^\/api\/sessions\/([^/]+)\/games$/);
 if(request.method==="DELETE"&&sessionGames){
   return bad("method_not_allowed","Delete the Session resource instead",405);
 }
 const segmentDetail=url.pathname.match(/^\/api\/segments\/([^/]+)$/);
 if(segmentDetail){
   const segmentId=decodeURIComponent(segmentDetail[1]);
   const seg=await env.DB.prepare("SELECT ps.id,ps.session_id AS sessionId,ps.sequence,s.group_id AS groupId,s.status FROM participant_segments ps JOIN sessions s ON s.id=ps.session_id WHERE ps.id=?").bind(segmentId).first<Record<string,unknown>>();
   if(!seg)return bad("segment_not_found","Segment not found",404);
   const groupId=String(seg.groupId);
   if(!await canUseGroup(env,authUserId,groupId))return deny("Group access required");
   if(request.method==="GET"){
     const pp=await env.DB.prepare("SELECT player_id AS playerId FROM segment_players WHERE segment_id=? ORDER BY seat_order").bind(segmentId).all();
     return json({segment:{id:seg.id,sessionId:seg.sessionId,sequence:seg.sequence,participantPlayerIds:pp.results.map(v=>v.playerId)}});
   }
   if(request.method==="PUT"){
     if(seg.status!=="active")return bad("session_not_active","Finalized Session is read-only",409);
     const b=await body(request),sequence=typeof b?.sequence==="number"?b.sequence:null,participants=Array.isArray(b?.participantPlayerIds)?b.participantPlayerIds.filter((v):v is string=>typeof v==="string"):[];
     if(!Number.isInteger(sequence)||![3,4].includes(participants.length)||new Set(participants).size!==participants.length)return bad("invalid_segment","Segment requires 3 or 4 unique Players");
     await env.DB.batch([env.DB.prepare("UPDATE participant_segments SET sequence=? WHERE id=?").bind(sequence,segmentId),env.DB.prepare("DELETE FROM segment_players WHERE segment_id=?").bind(segmentId),...participants.map((playerId,i)=>env.DB.prepare("INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES(?,?,?)").bind(segmentId,playerId,i))]);
     return json({ok:true});
   }
 }
 if(request.method==="DELETE"&&details){
   const id=decodeURIComponent(details[1]),sg=await sessionGroup(env,id);
   if(!sg||!await canInvite(env,authUserId,sg.groupId))return deny("System Admin or Group Admin required");
   const versionRaw=url.searchParams.get("version"),expectedVersion=versionRaw&&/^[0-9]+$/.test(versionRaw)?Number(versionRaw):null;
   if(expectedVersion===null||expectedVersion<1)return bad("invalid_expected_version","version is required");
   const deleted=await env.DB.prepare("DELETE FROM sessions WHERE id=? AND version=?").bind(id,expectedVersion).run();
   if((deleted.meta.changes??0)!==1)return bad("stale_update","Session was updated by another client",409);
   auditSuccess("session_deleted",{groupId:sg.groupId,resourceType:"session",resourceId:id});return new Response(null,{status:204});
 }
 const unlinkPlayer=url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/players\/([^/]+)\/link$/);
 if(request.method==="DELETE"&&unlinkPlayer){
   if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");
   const groupId=decodeURIComponent(unlinkPlayer[1]),playerId=decodeURIComponent(unlinkPlayer[2]);
   const link=await env.DB.prepare("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=? AND active=1").bind(groupId,playerId).first<{userId:string|null}>();
   if(!link)return bad("player_not_found","Active Player not found in Group",404);
   if(!link.userId)return json({ok:true,alreadyUnlinked:true});
   const userId=link.userId,now=new Date().toISOString();
   try{
     await env.DB.batch([
       env.DB.prepare("UPDATE group_players SET user_id=NULL WHERE group_id=? AND player_id=? AND user_id=?").bind(groupId,playerId,userId),
       env.DB.prepare("DELETE FROM group_memberships WHERE group_id=? AND user_id=? AND role='member'").bind(groupId,userId),
       env.DB.prepare("UPDATE invitations SET revoked_at=? WHERE group_id=? AND player_id=? AND used_at IS NULL AND revoked_at IS NULL").bind(now,groupId,playerId),
     ]);
     auditSuccess("player_user_unlinked",{groupId,resourceType:"player",resourceId:playerId});return json({ok:true,userId});
   }catch{return bad("player_unlink_failed","Player link could not be removed",409);}
 }
 const playerInvites=url.pathname.match(/^\/api\/groups\/([^/]+)\/players\/([^/]+)\/invitations$/);
 if(request.method==="POST"&&playerInvites){
   const groupId=decodeURIComponent(playerInvites[1]),playerId=decodeURIComponent(playerInvites[2]);
   if(!await canInvite(env,authUserId,groupId))return deny("System Admin or Group Admin required");
   const player=await env.DB.prepare("SELECT p.display_name AS displayName,gp.user_id AS userId FROM group_players gp JOIN players p ON p.id=gp.player_id WHERE gp.group_id=? AND gp.player_id=? AND gp.active=1").bind(groupId,playerId).first<{displayName:string;userId:string|null}>();
   if(!player)return bad("player_not_found","Active Player not found in Group",404);
   if(player.userId)return bad("player_already_linked","Player is already linked to a User",409);
   const token=invitationToken(),tokenHash=await invitationTokenHash(token),id=crypto.randomUUID(),now=new Date(),expires=new Date(now.getTime()+7*24*60*60*1000);
   await env.DB.batch([
     env.DB.prepare("UPDATE invitations SET revoked_at=? WHERE group_id=? AND player_id=? AND used_at IS NULL AND revoked_at IS NULL").bind(now.toISOString(),groupId,playerId),
     env.DB.prepare("INSERT INTO invitations(id,token_hash,group_id,player_id,role,created_by_user_id,expires_at,created_at) VALUES(?,?,?,?,'member',?,?,?)").bind(id,tokenHash,groupId,playerId,authUserId,expires.toISOString(),now.toISOString()),
   ]);
   const inviteUrl=new URL("/api/auth/line/start",url.origin);inviteUrl.searchParams.set("invite",token);
   auditSuccess("invitation_created",{groupId,resourceType:"invitation",resourceId:id});return json({invitation:{id,groupId,playerId,playerDisplayName:player.displayName,inviteUrl:inviteUrl.toString(),expiresAt:expires.toISOString()}},{status:201});
 }
 const groupInvites=url.pathname.match(/^\/api\/groups\/([^/]+)\/invitations$/);
 if(request.method==="GET"&&groupInvites){
   const groupId=decodeURIComponent(groupInvites[1]);
   if(!await canInvite(env,authUserId,groupId))return deny("System Admin or Group Admin required");
   const q=await env.DB.prepare("SELECT i.id,i.player_id AS playerId,p.display_name AS playerDisplayName,i.expires_at AS expiresAt,i.used_at AS usedAt,i.revoked_at AS revokedAt,i.created_at AS createdAt,u.display_name AS createdBy FROM invitations i JOIN players p ON p.id=i.player_id JOIN users u ON u.id=i.created_by_user_id WHERE i.group_id=? ORDER BY i.created_at DESC").bind(groupId).all();
   return json({invitations:q.results});
 }
 const revokeInvite=url.pathname.match(/^\/api\/invitations\/([^/]+)$/);
 if(request.method==="DELETE"&&revokeInvite){
   const invitationId=decodeURIComponent(revokeInvite[1]),invite=await env.DB.prepare("SELECT group_id AS groupId,used_at AS usedAt,revoked_at AS revokedAt FROM invitations WHERE id=?").bind(invitationId).first<{groupId:string;usedAt:string|null;revokedAt:string|null}>();
   if(!invite)return bad("invitation_not_found","Invitation not found",404);
   if(!await canInvite(env,authUserId,invite.groupId))return deny("System Admin or Group Admin required");
   if(invite.usedAt)return bad("invitation_used","Used invitation cannot be revoked",409);
   if(!invite.revokedAt)await env.DB.prepare("UPDATE invitations SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),invitationId).run();
   auditSuccess("invitation_revoked",{groupId:invite.groupId,resourceType:"invitation",resourceId:invitationId});return json({ok:true});
 }
 const adminUsers=url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/users$/);
 if(request.method==="GET"&&adminUsers){
   if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");
   const groupId=decodeURIComponent(adminUsers[1]);
   const groupExists=await env.DB.prepare("SELECT 1 AS ok FROM groups WHERE id=?").bind(groupId).first();
   if(!groupExists)return bad("group_not_found","Group not found",404);
   const q=await env.DB.prepare("SELECT u.id,u.display_name AS displayName,u.system_role AS systemRole,gm.role AS groupRole,gp.player_id AS playerId,p.display_name AS playerDisplayName FROM users u LEFT JOIN group_memberships gm ON gm.user_id=u.id AND gm.group_id=? LEFT JOIN group_players gp ON gp.user_id=u.id AND gp.group_id=? LEFT JOIN players p ON p.id=gp.player_id ORDER BY u.created_at,u.id").bind(groupId,groupId).all();
   return json({users:q.results});
 }
 const manage=url.pathname.match(/^\/api\/admin\/groups\/([^/]+)\/users\/([^/]+)$/);
 if(request.method==="PATCH"&&manage){
   if(!await isSystemAdmin(env,authUserId))return deny("System admin role required");
   const groupId=decodeURIComponent(manage[1]),userId=decodeURIComponent(manage[2]),b=await body(request);
   const role=b?.role==="group_admin"||b?.role==="member"?b.role:null,playerId=b?.playerId===null?null:textValue(b?.playerId),now=new Date().toISOString();
   if(!role)return bad("invalid_role","role must be group_admin or member");
   const groupExists=await env.DB.prepare("SELECT 1 AS ok FROM groups WHERE id=?").bind(groupId).first();
   const userExists=await env.DB.prepare("SELECT 1 AS ok FROM users WHERE id=?").bind(userId).first();
   if(!groupExists||!userExists)return bad("not_found","Group or User not found",404);
   if(playerId){
     const player=await env.DB.prepare("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=? AND active=1").bind(groupId,playerId).first<{userId:string|null}>();
     if(!player)return bad("invalid_player_link","Player is not active in this Group",409);
     if(player.userId&&player.userId!==userId)return bad("player_already_linked","Player is already linked to another User",409);
   }
   try{
     const statements=[
       env.DB.prepare("INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET role=excluded.role,updated_at=excluded.updated_at").bind(groupId,userId,role,now,now),
       env.DB.prepare("UPDATE group_players SET user_id=NULL WHERE group_id=? AND user_id=?").bind(groupId,userId),
     ];
     if(playerId)statements.push(env.DB.prepare("UPDATE group_players SET user_id=? WHERE group_id=? AND player_id=? AND (user_id IS NULL OR user_id=?)").bind(userId,groupId,playerId,userId));
     const rs=await env.DB.batch(statements);
     if(playerId&&rs[2]?.meta.changes!==1)throw new Error("player link");
     auditSuccess("membership_updated",{groupId,resourceType:"user",resourceId:userId});return json({ok:true,groupId,userId,role,playerId});
   }catch{return bad("membership_update_failed","Membership or Player link could not be updated",409);}
 }
 return bad("not_found","Not found",404);
 }} satisfies ExportedHandler<Env>;
