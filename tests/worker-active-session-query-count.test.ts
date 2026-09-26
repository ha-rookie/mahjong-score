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

class Statement{
  private values:unknown[]=[];
  constructor(private readonly db:FakeDb,private readonly sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{return this.db.first(this.sql,this.values) as T|null;}
  async all<T>():Promise<{results:T[]}>{return {results:this.db.all(this.sql,this.values) as T[]};}
  async run(){return {meta:{changes:0}};}
}

class FakeDb{
  readonly preparedSql:string[]=[];

  prepare(sql:string){
    this.preparedSql.push(sql);
    return new Statement(this,sql);
  }

  first(sql:string,values:unknown[]){
    if(sql.includes("FROM users WHERE id=? AND system_role='admin'"))return null;
    if(sql.includes("SELECT role FROM group_memberships")&&values[0]==="member"&&values[1]==="g1")return {role:"member"};
    if(sql.includes("FROM sessions WHERE group_id=? AND status='active'")){
      return {
        id:"s1",
        groupId:"g1",
        sessionDate:"2026-09-26",
        startedAt:"2026-09-26T01:00:00.000Z",
        endedAt:null,
        status:"active",
        note:null,
        version:1,
      };
    }
    return null;
  }

  all(sql:string,_values:unknown[]=[]){
    if(sql.includes("FROM session_participant_notes"))return [];
    if(sql.includes("FROM chip_results"))return [];
    if(sql.includes("FROM participant_segments ps JOIN segment_players sp")){
      return [{playerId:"p1"},{playerId:"p2"},{playerId:"p3"}];
    }
    return [];
  }
}

const env=(db:FakeDb)=>({
  DB:db as unknown as D1Database,
  ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,
  AUTH_SESSION_SECRET:secret,
});

const request=async(path:string,userId:string)=>new Request("https://example.test"+path,{
  headers:{cookie:await sessionCookie(userId)},
});

test("active Session data read stays at four queries regardless of history size",async()=>{
  const db=new FakeDb();
  const response=await worker.fetch(await request("/api/groups/g1/active-session","member"),env(db));

  assert.equal(response.status,200);
  const payload=await response.json() as {activeSession:{session:{id:string};participantPlayerIds:string[]}|null};
  assert.equal(payload.activeSession?.session.id,"s1");
  assert.deepEqual(payload.activeSession?.participantPlayerIds,["p1","p2","p3"]);

  const dataQueries=db.preparedSql.filter(sql=>
    sql.includes("FROM sessions WHERE group_id=? AND status='active'")||
    sql.includes("FROM session_participant_notes")||
    sql.includes("FROM chip_results")||
    sql.includes("FROM participant_segments ps JOIN segment_players sp")
  );
  assert.equal(dataQueries.length,4);

  assert.equal(
    db.preparedSql.some(sql=>sql.includes("FROM sessions WHERE group_id=? ORDER BY")),
    false,
  );
});
