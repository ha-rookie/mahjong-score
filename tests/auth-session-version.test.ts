import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker";

const enc=new TextEncoder();
const secret="S1-test-session-secret-longer-than-32-chars";
const b64=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64url");
const signedPayload=async(value:unknown)=>{
  const payload=b64(enc.encode(JSON.stringify(value)));
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
  return "mahjong_session="+payload+"."+sig;
};
const cookie=async(userId:string,exp:number,authVersion?:number)=>
  signedPayload(authVersion===undefined?{userId,exp}:{userId,exp,authVersion});
class Statement {
  private args:unknown[]=[];
  constructor(private db:FakeDb,private sql:string){}
  bind(...values:unknown[]){this.args=values;return this;}
  async first<T>():Promise<T|null>{
    if(this.sql.includes("SELECT id,auth_version AS authVersion FROM users WHERE id=?")){
      if(this.db.down)throw new Error("D1 temporarily unavailable");
      return this.db.hasUser?{id:this.args[0],authVersion:this.db.version} as T:null;
    }
    if(this.sql.includes("SELECT id,display_name AS displayName FROM users WHERE id=?"))return {id:this.args[0],displayName:"User",systemRole:"user"} as T;
    if(this.sql.includes("SELECT id,display_name AS displayName,system_role AS systemRole FROM users WHERE id=?"))
      return {id:this.args[0],displayName:"User",systemRole:"user"} as T;
    if(this.sql.includes("SELECT id FROM users WHERE system_role='admin'"))return {id:"admin"} as T;
    return null;
  }
  async all<T>():Promise<{results:T[]}>{return {results:[]};}
}
class FakeDb{
  version=0;
  hasUser=true;
  down=false;
  prepare(sql:string){return new Statement(this,sql);}
}
const env=(db:FakeDb,legacyUntil?:number)=>({
  DB:db as unknown as D1Database,
  ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,
  AUTH_SESSION_SECRET:secret,
  ...(legacyUntil?{AUTH_LEGACY_SESSION_ACCEPT_UNTIL:String(legacyUntil)}:{})
});
const call=async(path:string,db:FakeDb,session:string,legacyUntil?:number)=>worker.fetch(
  new Request("https://mahjong.test"+path,{headers:{cookie:session}}),
  env(db,legacyUntil)
);
const future=()=>Math.floor(Date.now()/1000)+11*60*60;
test("S1 versioned signed session can access /auth/me and a guarded API",async()=>{
  const db=new FakeDb(),session=await cookie("user1",future(),0);
  const me=await call("/api/auth/me",db,session);
  assert.equal(me.status,200);
  const route=await call("/api/no-such-route",db,session);
  assert.equal(route.status,404);
});
test("S1 rejects previously valid cookies on every protected route after an auth generation bump",async()=>{
  const db=new FakeDb(),sessionA=await cookie("user1",future(),0),sessionB=await cookie("user1",future(),0);
  db.version=1;
  const me=await call("/api/auth/me",db,sessionA);
  assert.equal(me.status,401);
  assert.match(me.headers.get("set-cookie")??"",/Max-Age=0/);
  for(const c of [sessionA,sessionB]){
    const route=await call("/api/no-such-route",db,c);
    assert.equal(route.status,401);
  }
  assert.equal((await call("/api/no-such-route",db,await cookie("user1",future(),1))).status,404);
});
test("S1 permits prior legacy sessions only until configured sunset while user authVersion remains 0",async()=>{
  const db=new FakeDb(),legacy=await cookie("user1",future());
  assert.equal((await call("/api/auth/me",db,legacy)).status,401);
  assert.equal((await call("/api/auth/me",db,legacy,Math.floor(Date.now()/1000)+120)).status,200);
  assert.equal((await call("/api/auth/me",db,legacy,Math.floor(Date.now()/1000)-1)).status,401);
  db.version=1;
  assert.equal((await call("/api/auth/me",db,legacy,Math.floor(Date.now()/1000)+120)).status,401);
});
test("S1 renews legacy session as a versioned cookie only after checking DB",async()=>{
  const db=new FakeDb(),legacy=await cookie("user1",future()),cutoff=Math.floor(Date.now()/1000)+60;
  const response=await call("/api/auth/me",db,legacy,cutoff);
  assert.equal(response.status,200);
  const renewed=response.headers.get("set-cookie")||"";
  assert.ok(renewed.startsWith("mahjong_session="));
  const p=renewed.split("=")[1]?.split(".")[0]||"";
  const json=JSON.parse(Buffer.from(p,"base64url").toString("utf8"));
  assert.equal(json.authVersion,0);
  assert.ok(json.exp>future());
});
test("S1 refuses authentic cookie when user no longer exists (identity not re-created)",async()=>{
  const db=new FakeDb();db.hasUser=false;
  const session=await cookie("missing",future(),0);
  assert.equal((await call("/api/auth/me",db,session)).status,401);
  assert.equal((await call("/api/no-such-route",db,session)).status,401);
});
test("S1 rejects malformed version even with a correctly signed cookie",async()=>{
  const db=new FakeDb();
  const signed=await cookie("user1",future(),-2);
  assert.equal((await call("/api/no-such-route",db,signed)).status,401);
});

test("S1 returns retryable 503, not 401, when D1 session verification is unavailable",async()=>{
  const db=new FakeDb();db.down=true;
  const session=await cookie("user1",future(),0);
  for(const path of ["/api/no-such-route","/api/auth/me"]){
    const response=await call(path,db,session);
    assert.equal(response.status,503);
    assert.equal(response.headers.get("set-cookie"),null,"Store outage must not erase a valid session");
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.equal(response.headers.get("retry-after"),"30");
    assert.deepEqual(await response.json(),{error:{code:"auth_service_unavailable",message:"Authentication is temporarily unavailable"}});
  }
  // The admin bootstrap authentication gate shares the same safe error response.
  const admin=await worker.fetch(new Request("https://mahjong.test/api/auth/bootstrap-admin",{
    method:"POST",headers:{cookie:session},
  }),env(db));
  assert.equal(admin.status,503);
  assert.equal(admin.headers.get("set-cookie"),null);
  assert.equal((await admin.json() as {error:{code:string}}).error.code,"auth_service_unavailable");
});

test("S1 rejects correctly signed null and array JSON instead of raising an unhandled error",async()=>{
  const db=new FakeDb();
  for(const payload of [null,[],[{"userId":"user1"}]]){
    const signed=await signedPayload(payload);
    const response=await call("/api/auth/me",db,signed);
    assert.equal(response.status,401);
    assert.match(response.headers.get("set-cookie")??"",/Max-Age=0/);
  }
});
test("S1 eagerly upgrades legacy cookies even when over 12 hours remain",async()=>{
  const db=new FakeDb(),exp=Math.floor(Date.now()/1000)+13*60*60;
  const old=await cookie("user1",exp);
  const response=await call("/api/auth/me",db,old,Math.floor(Date.now()/1000)+240);
  assert.equal(response.status,200);
  const renewed=response.headers.get("set-cookie");
  assert.ok(renewed);
  const data=JSON.parse(Buffer.from(renewed.split("=")[1].split(".")[0],"base64url").toString("utf8"));
  assert.equal(data.authVersion,0);
  assert.ok(data.exp>exp);
});
test("S1 rejects an excessively distant legacy cutoff even if a config is supplied",async()=>{
  const db=new FakeDb(),old=await cookie("user1",future());
  assert.equal((await call("/api/auth/me",db,old,Math.floor(Date.now()/1000)+7*24*60*60)).status,401);
});
