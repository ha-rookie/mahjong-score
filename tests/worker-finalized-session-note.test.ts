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

type Role="group_admin"|"member";
type User={systemAdmin?:boolean;memberships?:Record<string,Role>};
type SessionRow={groupId:string;version:number;status:"active"|"finalized"};

class FakeStatement{
  values:unknown[]=[];
  constructor(private db:FakeDb,private sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{return this.db.first(this.sql,this.values) as T|null;}
  async all<T>():Promise<{results:T[]}>{return {results:[]};}
  async run(){return {meta:{changes:this.db.change(this.sql,this.values)}};}
}

class FakeDb{
  readonly preparedSql:string[]=[];
  private nextRunChanges:number|null=null;
  constructor(private users:Record<string,User>,private sessions:Record<string,SessionRow>){}
  prepare(sql:string){this.preparedSql.push(sql);return new FakeStatement(this,sql);}
  async batch(){return [];}
  first(sql:string,values:unknown[]){
    if(sql.includes("FROM users WHERE id=? AND system_role='admin'"))return this.users[String(values[0])]?.systemAdmin?{ok:1}:null;
    if(sql.includes("SELECT role FROM group_memberships")){
      const role=this.users[String(values[0])]?.memberships?.[String(values[1])];
      return role?{role}:null;
    }
    if(sql.includes("SELECT group_id AS groupId FROM sessions")){
      const row=this.sessions[String(values[0])];
      return row?{groupId:row.groupId}:null;
    }
    if(sql.includes("SELECT status FROM sessions WHERE id=?")){
      const row=this.sessions[String(values[0])];
      return row?{status:row.status}:null;
    }
    return null;
  }
  change(sql:string,values:unknown[]){
    if(this.nextRunChanges!==null){const value=this.nextRunChanges;this.nextRunChanges=null;return value;}
    if(sql.includes("UPDATE sessions SET note=?,updated_at=?,version=version+1")){
      const sessionId=String(values[2]),expectedVersion=Number(values[3]),row=this.sessions[sessionId];
      return row&&row.status==="finalized"&&row.version===expectedVersion?1:0;
    }
    return 1;
  }
  simulateNextRunChanges(value:number){this.nextRunChanges=value;}
}

const env=(db:FakeDb)=>({DB:db as unknown as D1Database,ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,AUTH_SESSION_SECRET:secret});
const request=async(path:string,init:RequestInit,userId:string)=>{
  const headers=new Headers(init.headers);headers.set("cookie",await sessionCookie(userId));
  return new Request("https://example.test"+path,{...init,headers});
};
const errorCode=async(response:Response)=>(await response.json() as {error:{code:string}}).error.code;
const updateBody=(expectedVersion=2)=>JSON.stringify({note:"updated memo",updatedAt:"2026-09-30T00:00:00Z",expectedVersion});

test("group member can update only finalized Session memo",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2,status:"finalized"}});
  const response=await worker.fetch(await request("/api/sessions/s1/note",{method:"PATCH",headers:{"content-type":"application/json"},body:updateBody()},"member"),env(db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{note:"updated memo",updatedAt:"2026-09-30T00:00:00Z",version:3});
  const updateSql=db.preparedSql.find(sql=>sql.includes("UPDATE sessions SET note=?,updated_at=?,version=version+1"));
  assert.ok(updateSql);
  assert.match(updateSql,/status='finalized'/);
  assert.doesNotMatch(updateSql,/chip_results|session_participant_notes|ended_at|SET status=/);
});

test("group member cannot update finalized Session memo in another group",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s2:{groupId:"g2",version:2,status:"finalized"}});
  const response=await worker.fetch(await request("/api/sessions/s2/note",{method:"PATCH",headers:{"content-type":"application/json"},body:updateBody()},"member"),env(db));
  assert.equal(response.status,403);
  assert.equal(await errorCode(response),"forbidden");
});

test("memo-only endpoint rejects active Session",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2,status:"active"}});
  const response=await worker.fetch(await request("/api/sessions/s1/note",{method:"PATCH",headers:{"content-type":"application/json"},body:updateBody()},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"session_not_finalized");
});

test("memo-only endpoint rejects stale finalized Session update",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2,status:"finalized"}});
  db.simulateNextRunChanges(0);
  const response=await worker.fetch(await request("/api/sessions/s1/note",{method:"PATCH",headers:{"content-type":"application/json"},body:updateBody()},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});

test("memo-only endpoint requires explicit note and expectedVersion",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2,status:"finalized"}});
  const response=await worker.fetch(await request("/api/sessions/s1/note",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({updatedAt:"2026-09-30T00:00:00Z",expectedVersion:2})},"member"),env(db));
  assert.equal(response.status,400);
  assert.equal(await errorCode(response),"invalid_session_note_update");
});
