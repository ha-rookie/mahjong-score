import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker";

const secret="test-session-secret-at-least-32-characters";
const enc=new TextEncoder();
const base64url=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const sessionCookie=async(userId:string)=>{
  const payload=base64url(enc.encode(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+3600})));
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=base64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
  return `mahjong_session=${payload}.${sig}`;
};

type User={systemAdmin?:boolean;memberships?:Record<string,"group_admin"|"member">};
class FakeStatement{
  values:unknown[]=[];
  constructor(private db:FakeDb,private sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{return this.db.first(this.sql,this.values) as T|null;}
  async all<T>():Promise<{results:T[]}>{return {results:this.db.all(this.sql,this.values) as T[]};}
  async run(){return {meta:{changes:this.db.change()}};}
}
class FakeDb{
  readonly preparedSql:string[]=[];
  constructor(
    private users:Record<string,User>,
    private sessions:Record<string,{groupId:string;version:number;status?:string}>={},
    private forceStale=false,
    private segments:Record<string,{sessionId:string;players:string[]}>={},
    private games:Record<string,{sessionId:string;segmentId:string;version:number;groupId:string;status:string}>={},
    private groupPlayers:Record<string,string[]>={},
    private failNextBatch=false,
    private nextRunChanges:number|null=null,
    private gameResults:Record<string,Array<{playerId:string;scorePoint:number}>>={},
    private gameTags:Record<string,Array<{type:"yakuman"|"double-yakuman";playerId:string|null}>>={},
  ){}
  prepare(sql:string){this.preparedSql.push(sql);return new FakeStatement(this,sql);}
  async batch(statements:FakeStatement[]){if(this.failNextBatch){this.failNextBatch=false;return statements.map((_,i)=>({meta:{changes:i===0?0:1}}));}return statements.map(()=>({meta:{changes:this.forceStale?0:1}}));}
  first(sql:string,values:unknown[]){
    if(sql.includes("FROM users WHERE id=? AND system_role='admin'")){
      return this.users[String(values[0])]?.systemAdmin?{ok:1}:null;
    }
    if(sql.includes("SELECT role FROM group_memberships")){
      const role=this.users[String(values[0])]?.memberships?.[String(values[1])];
      return role?{role}:null;
    }
    if(sql.includes("FROM sessions WHERE group_id=? AND status='active'")){
      const entry=Object.entries(this.sessions).find(([,row])=>row.groupId===String(values[0])&&(row.status??"active")==="active");
      if(!entry)return null;
      const [id,row]=entry;
      if(sql.includes("group_id AS groupId"))return {id,groupId:row.groupId,sessionDate:"2026-09-25",startedAt:"2026-09-25T06:00:00Z",endedAt:null,status:row.status??"active",note:null,version:row.version};
      return {id};
    }
    if(sql.includes("FROM sessions s WHERE s.id=?")&&sql.includes("AS gameCount")){
      const row=this.sessions[String(values[0])];
      if(!row)return null;
      const gameCount=Object.values(this.games).filter(game=>game.sessionId===String(values[0])).length;
      return {status:row.status??"active",version:row.version,gameCount};
    }
    if(sql.includes("SELECT status FROM sessions WHERE id=?")){
      const row=this.sessions[String(values[0])];
      return row?{status:row.status??"active"}:null;
    }
    if(sql.includes("SELECT group_id AS groupId FROM sessions")){
      const row=this.sessions[String(values[0])];
      return row?{groupId:row.groupId}:null;
    }
    if(sql.includes("SELECT ps.id,ps.session_id AS sessionId")){
      const row=this.segments[String(values[0])];
      if(!row)return null;
      const session=this.sessions[row.sessionId];
      return session?{id:String(values[0]),sessionId:row.sessionId,sequence:1,groupId:session.groupId,status:"active"}:null;
    }
    if(sql.includes("SELECT g.id,g.session_id AS sessionId")){
      const row=this.games[String(values[0])];
      return row?{id:String(values[0]),sessionId:row.sessionId,segmentId:row.segmentId,sequence:1,playedAt:"2026-01-01T00:00:00Z",version:row.version,groupId:row.groupId,status:row.status}:null;
    }
    if(sql.includes("SELECT id FROM participant_segments")){
      const row=this.segments[String(values[0])];
      return row?.sessionId===String(values[1])?{id:String(values[0])}:null;
    }
    return null;
  }
  all(sql?:string,values:unknown[]=[]){
    if(sql?.startsWith("SELECT id,session_id AS sessionId,sequence FROM participant_segments WHERE session_id=?")){
      let sequence=0;
      return Object.entries(this.segments).filter(([,segment])=>segment.sessionId===String(values[0])).map(([id,segment])=>({id,sessionId:segment.sessionId,sequence:++sequence}));
    }
    if(sql?.includes("FROM segment_players WHERE segment_id IN")){
      return values.map(String).flatMap(segmentId=>(this.segments[segmentId]?.players??[]).map(playerId=>({segmentId,playerId})));
    }
    if(sql?.includes("FROM games WHERE session_id=?")){
      let sequence=0;
      return Object.entries(this.games).filter(([,game])=>game.sessionId===String(values[0])).map(([id,game])=>({id,sessionId:game.sessionId,segmentId:game.segmentId,sequence:++sequence,playedAt:"2026-09-25T08:00:00Z",version:game.version}));
    }
    if(sql?.includes("FROM game_results WHERE game_id IN")){
      return values.map(String).flatMap(gameId=>(this.gameResults[gameId]??[]).map(result=>({gameId,...result})));
    }
    if(sql?.includes("FROM game_tags WHERE game_id IN")){
      return values.map(String).flatMap(gameId=>(this.gameTags[gameId]??[]).map(tag=>({gameId,...tag})));
    }
    if(sql?.includes("FROM participant_segments ps JOIN segment_players sp")&&sql.includes("MAX(sequence)")){
      const segment=Object.values(this.segments).find(row=>row.sessionId===String(values[0]));
      return (segment?.players??[]).map(playerId=>({playerId}));
    }
    if(sql?.includes("SELECT player_id AS playerId FROM group_players")){
      return (this.groupPlayers[String(values[0])]??[]).filter(playerId=>values.slice(1).map(String).includes(playerId)).map(playerId=>({playerId}));
    }
    if(sql?.includes("SELECT player_id AS playerId FROM segment_players")){
      return (this.segments[String(values[0])]?.players??[]).map(playerId=>({playerId}));
    }
    if(sql?.includes("SELECT DISTINCT sp.player_id AS playerId")){
      const sessionId=String(values[0]);
      return Object.values(this.segments).filter(segment=>segment.sessionId===sessionId).flatMap(segment=>segment.players).filter((playerId,index,all)=>all.indexOf(playerId)===index).map(playerId=>({playerId}));
    }
    return [];
  }
  change(){if(this.nextRunChanges!==null){const value=this.nextRunChanges;this.nextRunChanges=null;return value;}return this.forceStale?0:1;}
  simulateBatchRace(){this.failNextBatch=true;}
  simulateNextRunChanges(value:number){this.nextRunChanges=value;}
}
const env=(db:FakeDb)=>({DB:db as unknown as D1Database,ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,AUTH_SESSION_SECRET:secret});
const request=async(path:string,init:RequestInit={},userId?:string)=>{
  const headers=new Headers(init.headers);
  if(userId)headers.set("cookie",await sessionCookie(userId));
  return new Request("https://example.test"+path,{...init,headers});
};
const errorCode=async(response:Response)=>(await response.json() as {error:{code:string}}).error.code;

test("protected API rejects unauthenticated request",async()=>{
  const response=await worker.fetch(await request("/api/groups"),env(new FakeDb({})));
  assert.equal(response.status,401);
  assert.equal(await errorCode(response),"unauthorized");
});

test("member cannot create a group",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}});
  const response=await worker.fetch(await request("/api/groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"g2",name:"Nope",createdAt:"2026-01-01",updatedAt:"2026-01-01"})},"member"),env(db));
  assert.equal(response.status,403);
  assert.equal(await errorCode(response),"forbidden");
});

test("member cannot cross group boundary",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}});
  const response=await worker.fetch(await request("/api/groups/g2/players",{},"member"),env(db));
  assert.equal(response.status,403);
  assert.equal(await errorCode(response),"forbidden");
});

test("group member can read own group players",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}});
  const response=await worker.fetch(await request("/api/groups/g1/players",{},"member"),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{players:[]});
});

test("group member can read active Session without loading Session history",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:3,status:"active"}},
    false,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
  );
  const response=await worker.fetch(await request("/api/groups/g1/active-session",{},"member"),env(db));
  assert.equal(response.status,200);
  const payload=await response.json() as {activeSession:{session:{id:string;version:number};participantPlayerIds:string[]}|null};
  assert.equal(payload.activeSession?.session.id,"s1");
  assert.equal(payload.activeSession?.session.version,3);
  assert.deepEqual(payload.activeSession?.participantPlayerIds,["p1","p2","p3"]);
});

test("active Session endpoint returns null when the Group has no active Session",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}});
  const response=await worker.fetch(await request("/api/groups/g1/active-session",{},"member"),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{activeSession:null});
});

test("system admin can create a group",async()=>{
  const db=new FakeDb({admin:{systemAdmin:true}});
  const response=await worker.fetch(await request("/api/groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"g2",name:"Allowed",createdAt:"2026-01-01",updatedAt:"2026-01-01"})},"admin"),env(db));
  assert.equal(response.status,201);
});

test("member cannot rename a group",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}});
  const response=await worker.fetch(await request("/api/groups/g1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:"Renamed",updatedAt:"2026-01-02"})},"member"),env(db));
  assert.equal(response.status,403);
});

test("system admin API rejects an oversized renamed group name",async()=>{
  const db=new FakeDb({admin:{systemAdmin:true}});
  const response=await worker.fetch(await request("/api/groups/g1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name:"G".repeat(41),updatedAt:"2026-01-02"})},"admin"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"group_name_too_long");
});

test("system admin API rejects an oversized group name",async()=>{
  const db=new FakeDb({admin:{systemAdmin:true}});
  const response=await worker.fetch(await request("/api/groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"g2",name:"G".repeat(41),createdAt:"2026-01-01",updatedAt:"2026-01-01"})},"admin"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"group_name_too_long");
});

test("system admin API rejects an oversized player name",async()=>{
  const db=new FakeDb({admin:{systemAdmin:true}});
  const response=await worker.fetch(await request("/api/groups/g1/players",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"p1",displayName:"P".repeat(31),createdAt:"2026-01-01",updatedAt:"2026-01-01"})},"admin"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"player_name_too_long");
});

test("session update API rejects an oversized note",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:"N".repeat(501),status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"session_note_too_long");
});

test("game create API rejects balanced scores outside the practical limit",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1/games",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"game1",segmentId:"seg1",sequence:1,playedAt:"2026-01-01T00:00:00Z",results:[{playerId:"p1",scorePoint:1000001},{playerId:"p2",scorePoint:-1000000},{playerId:"p3",scorePoint:-1}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_game_results");
});

test("session update API rejects balanced chips outside the practical limit",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:null,status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[{playerId:"p1",chipCount:10001},{playerId:"p2",chipCount:-10000},{playerId:"p3",chipCount:-1}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_session_details");
});


test("stale session update returns 409 without accepting update",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2}},true,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:"stale",status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});


test("game list bulk loads results and tags with three data queries",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    false,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
    {
      game1:{sessionId:"s1",segmentId:"seg1",version:2,groupId:"g1",status:"active"},
      game2:{sessionId:"s1",segmentId:"seg1",version:1,groupId:"g1",status:"active"},
    },
    {},false,null,
    {
      game1:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}],
      game2:[{playerId:"p1",scorePoint:-8},{playerId:"p2",scorePoint:3},{playerId:"p3",scorePoint:5}],
    },
    {game1:[{type:"yakuman",playerId:"p1"}]},
  );
  const response=await worker.fetch(await request("/api/sessions/s1/games",{},"member"),env(db));
  assert.equal(response.status,200);
  const payload=await response.json() as {games:Array<{id:string;results:Array<{playerId:string;scorePoint:number}>;tags:Array<{type:string;playerId:string|null}>}>};
  assert.equal(payload.games.length,2);
  assert.deepEqual(payload.games[0]?.results,[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}]);
  assert.deepEqual(payload.games[0]?.tags,[{type:"yakuman",playerId:"p1"}]);
  assert.deepEqual(payload.games[1]?.results,[{playerId:"p1",scorePoint:-8},{playerId:"p2",scorePoint:3},{playerId:"p3",scorePoint:5}]);
  assert.deepEqual(payload.games[1]?.tags,[]);
  const gameReadSql=db.preparedSql.filter(sql=>sql.includes("FROM games WHERE session_id=?")||sql.includes("FROM game_results WHERE game_id IN")||sql.includes("FROM game_tags WHERE game_id IN"));
  assert.equal(gameReadSql.length,3);
});

test("empty game list does not issue child queries",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1,status:"active"}});
  const response=await worker.fetch(await request("/api/sessions/s1/games",{},"member"),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{games:[]});
  assert.equal(db.preparedSql.filter(sql=>sql.includes("FROM game_results WHERE game_id IN")||sql.includes("FROM game_tags WHERE game_id IN")).length,0);
});

test("game create rejects a Segment from another Session",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{segOther:{sessionId:"s2",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1/games",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"game1",segmentId:"segOther",sequence:1,playedAt:"2026-01-01T00:00:00Z",results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_game_segment");
});

test("game create rejects result players that do not match Segment participants",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1/games",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"game1",segmentId:"seg1",sequence:1,playedAt:"2026-01-01T00:00:00Z",results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"outsider",scorePoint:-5}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_game_participants");
});


test("session detail update rejects non-participant chip player",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:null,status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[{playerId:"p1",chipCount:1},{playerId:"p2",chipCount:-1},{playerId:"outsider",chipCount:0}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_session_participants");
});

test("session detail update rejects duplicate chip player",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:null,status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[{playerId:"p1",chipCount:1},{playerId:"p1",chipCount:-1},{playerId:"p3",chipCount:0}]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_session_details");
});


test("game edit rejects a Segment from another Session before mutating results",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1}},false,{segOther:{sessionId:"s2",players:["p1","p2","p3"]}},{game1:{sessionId:"s1",segmentId:"seg1",version:1,groupId:"g1",status:"active"}});
  const response=await worker.fetch(await request("/api/games/game1",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({segmentId:"segOther",sequence:1,playedAt:"2026-01-01T00:00:00Z",expectedVersion:1,results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}],tags:[]})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_game_segment");
});


test("session start rejects a Group that already has an active Session",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{existing:{groupId:"g1",version:1}});
  const response=await worker.fetch(await request("/api/groups/g1/sessions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"new-session",segmentId:"seg-new",sessionDate:"2026-09-25",startedAt:"2026-09-25T06:00:00Z",participantPlayerIds:["p1","p2","p3"]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"active_session_exists");
});


test("segment list bulk loads participants with two data queries",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    false,
    {
      seg1:{sessionId:"s1",players:["p1","p2","p3"]},
      seg2:{sessionId:"s1",players:["p1","p3","p4"]},
    },
  );
  const response=await worker.fetch(await request("/api/sessions/s1/segments",{},"member"),env(db));
  assert.equal(response.status,200);
  const payload=await response.json() as {segments:Array<{id:string;sequence:number;participantPlayerIds:string[]}>};
  assert.equal(payload.segments.length,2);
  assert.deepEqual(payload.segments[0],{id:"seg1",sessionId:"s1",sequence:1,participantPlayerIds:["p1","p2","p3"]});
  assert.deepEqual(payload.segments[1],{id:"seg2",sessionId:"s1",sequence:2,participantPlayerIds:["p1","p3","p4"]});
  const segmentReadSql=db.preparedSql.filter(sql=>sql.includes("FROM participant_segments WHERE session_id=?")||sql.includes("FROM segment_players WHERE segment_id IN"));
  assert.equal(segmentReadSql.length,2);
});

test("empty segment list does not issue participant query",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1,status:"active"}});
  const response=await worker.fetch(await request("/api/sessions/s1/segments",{},"member"),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{segments:[]});
  assert.equal(db.preparedSql.filter(sql=>sql.includes("FROM segment_players WHERE segment_id IN")).length,0);
});

test("segment edit is rejected because Session participants are immutable",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1,status:"active"}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/segments/seg1",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({sequence:1,participantPlayerIds:["p1","p2","p3"]})},"member"),env(db));
  assert.equal(response.status,405);
  assert.equal(await errorCode(response),"segment_update_not_supported");
});


test("finalized Session cannot be mutated or reopened",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2,status:"finalized"}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"active",updatedAt:"2026-09-25T06:00:00Z",expectedVersion:2,participantNotes:[],chipResults:[]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"session_not_active");
});


test("game create returns 409 when Session finalizes between validation and batch write",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:1,status:"active"}},false,{seg1:{sessionId:"s1",players:["p1","p2","p3"]}});
  db.simulateBatchRace();
  const response=await worker.fetch(await request("/api/sessions/s1/games",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"game-race",segmentId:"seg1",sequence:1,playedAt:"2026-09-25T06:00:00Z",results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"game_write_failed");
});


test("game delete accepts D1 cascade change count greater than one",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    false,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
    {game1:{sessionId:"s1",segmentId:"seg1",version:1,groupId:"g1",status:"active"}}
  );
  db.simulateNextRunChanges(4);
  const response=await worker.fetch(await request("/api/games/game1?version=1",{method:"DELETE"},"member"),env(db));
  assert.equal(response.status,204);
});

test("session delete accepts D1 cascade change count greater than one",async()=>{
  const db=new FakeDb(
    {admin:{memberships:{g1:"group_admin"}}},
    {s1:{groupId:"g1",version:2,status:"finalized"}}
  );
  db.simulateNextRunChanges(7);
  const response=await worker.fetch(await request("/api/sessions/s1?version=2",{method:"DELETE"},"admin"),env(db));
  assert.equal(response.status,204);
});


test("stale game update returns 409",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    true,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
    {game1:{sessionId:"s1",segmentId:"seg1",version:2,groupId:"g1",status:"active"}}
  );
  const response=await worker.fetch(await request("/api/games/game1",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({segmentId:"seg1",sequence:1,playedAt:"2026-09-25T08:00:00Z",expectedVersion:1,results:[{playerId:"p1",scorePoint:10},{playerId:"p2",scorePoint:-5},{playerId:"p3",scorePoint:-5}],tags:[]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});

test("stale game delete returns 409",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    true,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
    {game1:{sessionId:"s1",segmentId:"seg1",version:2,groupId:"g1",status:"active"}}
  );
  const response=await worker.fetch(await request("/api/games/game1?version=1",{method:"DELETE"},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});

test("group admin can delete a Session",async()=>{
  const db=new FakeDb(
    {admin:{memberships:{g1:"group_admin"}}},
    {s1:{groupId:"g1",version:2,status:"finalized"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1?version=2",{method:"DELETE"},"admin"),env(db));
  assert.equal(response.status,204);
});


test("group member can cancel an empty active Session",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:1})},"member"),env(db));
  assert.equal(response.status,204);
});

test("empty Session cancel rejects Session after a Game was registered",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}},
    false,
    {seg1:{sessionId:"s1",players:["p1","p2","p3"]}},
    {game1:{sessionId:"s1",segmentId:"seg1",version:1,groupId:"g1",status:"active"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:1})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"session_not_empty");
});

test("empty Session cancel rejects finalized Session",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:2,status:"finalized"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:2})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"session_not_active");
});

test("empty Session cancel rejects stale version",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:2,status:"active"}},
    true
  );
  const response=await worker.fetch(await request("/api/sessions/s1/cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersion:1})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});

test("zero-game Session cannot be finalized through API",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:1,status:"active"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"finalized",endedAt:"2026-09-25T09:00:00Z",updatedAt:"2026-09-25T09:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"session_empty");
});

test("group member still cannot use administrative Session delete",async()=>{
  const db=new FakeDb(
    {member:{memberships:{g1:"member"}}},
    {s1:{groupId:"g1",version:2,status:"finalized"}}
  );
  const response=await worker.fetch(await request("/api/sessions/s1?version=2",{method:"DELETE"},"member"),env(db));
  assert.equal(response.status,403);
  assert.equal(await errorCode(response),"forbidden");
});
