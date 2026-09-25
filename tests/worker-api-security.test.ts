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
  async first<T>():Promise<T|null>{return this.db.first(this.sql) as T|null;}
  async all<T>():Promise<{results:T[]}>{return {results:this.db.all() as T[]};}
  async run(){return {meta:{changes:this.db.change()}};}
}
class FakeDb{
  constructor(
    private users:Record<string,User>,
    private sessions:Record<string,{groupId:string;version:number}>={},
    private forceStale=false,
  ){}
  prepare(sql:string){return new FakeStatement(this,sql);}
  async batch(statements:FakeStatement[]){return statements.map(()=>({meta:{changes:this.forceStale?0:1}}));}
  first(sql:string,values:unknown[]){
    if(sql.includes("FROM users WHERE id=? AND system_role='admin'")){
      return this.users[String(values[0])]?.systemAdmin?{ok:1}:null;
    }
    if(sql.includes("SELECT role FROM group_memberships")){
      const role=this.users[String(values[0])]?.memberships?.[String(values[1])];
      return role?{role}:null;
    }
    if(sql.includes("SELECT group_id AS groupId FROM sessions")){
      const row=this.sessions[String(values[0])];
      return row?{groupId:row.groupId}:null;
    }
    return null;
  }
  all(){return [];}
  change(){return this.forceStale?0:1;}
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

test("system admin can create a group",async()=>{
  const db=new FakeDb({admin:{systemAdmin:true}});
  const response=await worker.fetch(await request("/api/groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:"g2",name:"Allowed",createdAt:"2026-01-01",updatedAt:"2026-01-01"})},"admin"),env(db));
  assert.equal(response.status,201);
});

test("stale session update returns 409 without accepting update",async()=>{
  const db=new FakeDb({member:{memberships:{g1:"member"}}},{s1:{groupId:"g1",version:2}},true);
  const response=await worker.fetch(await request("/api/sessions/s1",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({note:"stale",status:"active",endedAt:null,updatedAt:"2026-01-01T00:00:00Z",expectedVersion:1,participantNotes:[],chipResults:[]})},"member"),env(db));
  assert.equal(response.status,409);
  assert.equal(await errorCode(response),"stale_update");
});
