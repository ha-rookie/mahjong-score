import fs from "node:fs";

const replaceOnce=(path,from,to)=>{
  const before=fs.readFileSync(path,"utf8");
  if(!before.includes(from))throw new Error(`Expected source not found in ${path}`);
  const after=before.replace(from,to);
  if(after===before)throw new Error(`No change made in ${path}`);
  fs.writeFileSync(path,after);
};

replaceOnce(
  "src/worker.ts",
  ` const segments=url.pathname.match(/^\\/api\\/sessions\\/([^/]+)\\/segments$/);if(request.method==="GET"&&segments){const sessionId=decodeURIComponent(segments[1]),sg=await sessionGroup(env,sessionId);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const q=await env.DB.prepare("SELECT id,session_id AS sessionId,sequence FROM participant_segments WHERE session_id=? ORDER BY sequence,id").bind(sessionId).all();const result=[];for(const s of q.results as Array<Record<string,unknown>>){const pp=await env.DB.prepare("SELECT player_id AS playerId FROM segment_players WHERE segment_id=? ORDER BY seat_order").bind(s.id).all();result.push({...s,participantPlayerIds:pp.results.map(v=>v.playerId)});}return json({segments:result});}`,
  ` const segments=url.pathname.match(/^\\/api\\/sessions\\/([^/]+)\\/segments$/);if(request.method==="GET"&&segments){const sessionId=decodeURIComponent(segments[1]),sg=await sessionGroup(env,sessionId);if(!sg||!await canUseGroup(env,authUserId,sg.groupId))return deny("Group access required");const q=await env.DB.prepare("SELECT id,session_id AS sessionId,sequence FROM participant_segments WHERE session_id=? ORDER BY sequence,id").bind(sessionId).all();const rows=q.results as Array<Record<string,unknown>>;if(!rows.length)return json({segments:[]});const segmentIds=rows.map(s=>String(s.id)),placeholders=segmentIds.map(()=>"?").join(",");const pp=await env.DB.prepare(\`SELECT segment_id AS segmentId,player_id AS playerId FROM segment_players WHERE segment_id IN (\${placeholders}) ORDER BY segment_id,seat_order\`).bind(...segmentIds).all();const playersBySegment=new Map<string,string[]>();for(const p of pp.results as Array<Record<string,unknown>>){const id=String(p.segmentId),items=playersBySegment.get(id)??[];items.push(String(p.playerId));playersBySegment.set(id,items);}return json({segments:rows.map(s=>({...s,participantPlayerIds:playersBySegment.get(String(s.id))??[]}))});}`,
);

replaceOnce(
  "tests/worker-api-security.test.ts",
  `  all(sql?:string,values:unknown[]=[]){\n    if(sql?.includes("FROM games WHERE session_id=?")){`,
  `  all(sql?:string,values:unknown[]=[]){\n    if(sql?.startsWith("SELECT id,session_id AS sessionId,sequence FROM participant_segments WHERE session_id=?")){\n      let sequence=0;\n      return Object.entries(this.segments).filter(([,segment])=>segment.sessionId===String(values[0])).map(([id,segment])=>({id,sessionId:segment.sessionId,sequence:++sequence}));\n    }\n    if(sql?.includes("FROM segment_players WHERE segment_id IN")){\n      return values.map(String).flatMap(segmentId=>(this.segments[segmentId]?.players??[]).map(playerId=>({segmentId,playerId})));\n    }\n    if(sql?.includes("FROM games WHERE session_id=?")){`,
);

replaceOnce(
  "tests/worker-api-security.test.ts",
  `test("segment edit is rejected because Session participants are immutable",async()=>{`,
  `test("segment list bulk loads participants with two data queries",async()=>{\n  const db=new FakeDb(\n    {member:{memberships:{g1:"member"}}},\n    {s1:{groupId:"g1",version:1,status:"active"}},\n    false,\n    {\n      seg1:{sessionId:"s1",players:["p1","p2","p3"]},\n      seg2:{sessionId:"s1",players:["p1","p3","p4"]},\n    },\n  );\n  const response=await worker.fetch(await request("/api/sessions/s1/segments",{},"member"),env(db));\n  assert.equal(response.status,200);\n  const payload=await response.json() as {segments:Array<{id:string;sequence:number;participantPlayerIds:string[]}>};\n  assert.equal(payload.segments.length,2);\n  assert.deepEqual(payload.segments[0],{id:"seg1",sessionId:"s1",sequence:1,participantPlayerIds:["p1","p2","p3"]});\n  assert.deepEqual(payload.segments[1],{id:"seg2",sessionId:"s1",sequence:2,participantPlayerIds:["p1","p3","p4"]});\n  const segmentReadSql=db.preparedSql.filter(sql=>sql.includes("FROM participant_segments WHERE session_id=?")||sql.includes("FROM segment_players WHERE segment_id IN"));\n  assert.equal(segmentReadSql.length,2);\n});\n\ntest("empty segment list does not issue participant query",async()=>{\n  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1,status:"active"}});\n  const response=await worker.fetch(await request("/api/sessions/s1/segments",{},"member"),env(db));\n  assert.equal(response.status,200);\n  assert.deepEqual(await response.json(),{segments:[]});\n  assert.equal(db.preparedSql.filter(sql=>sql.includes("FROM segment_players WHERE segment_id IN")).length,0);\n});\n\ntest("segment edit is rejected because Session participants are immutable",async()=>{`,
);

console.log("Segment read optimization patch applied.");
