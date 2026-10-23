import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker";

const encoder=new TextEncoder(),sessionSecret="S2B HTTP test session secret 40 characters";
const b64=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64url");
const signedCookie=async(userId="user-1")=>{
  const payload=b64(encoder.encode(JSON.stringify({
    userId,exp:Math.floor(Date.now()/1000)+3600,authVersion:0,
  })));
  const key=await crypto.subtle.importKey("raw",encoder.encode(sessionSecret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(payload))));
  return "mahjong_session="+payload+"."+mac;
};
class FakeDb{
  readonly prepared:string[]=[];
  stepups=0;
  prepare(sql:string){
    this.prepared.push(sql);
    const inc=()=>{this.stepups++;};
    let args:unknown[]=[];
    return {
      bind(...values:unknown[]){args=values;return this;},
      async first<T>():Promise<T|null>{
        if(sql.includes("SELECT id,auth_version AS authVersion FROM users WHERE id=?"))
          return {id:args[0],authVersion:0} as T;
        if(sql.includes("SELECT 1 AS ok FROM external_identities"))
          return {ok:1} as T;
        if(sql.includes("SELECT COUNT(*) AS total FROM passkey_line_stepups"))
          return {total:0} as T;
        return null;
      },
      async run(){if(sql.startsWith("INSERT INTO passkey_line_stepups")){inc();return{meta:{changes:1}};}
        throw new Error("Unexpected mutation");},
      async all<T>():Promise<{results:T[]}>{return{results:[]};},
    };
  }
}
const host="https://mahjong-score.ha-rookie.workers.dev";
const makeEnv=(db:FakeDb,enabled:boolean)=>({
  DB:db as unknown as D1Database,
  ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,
  AUTH_SESSION_SECRET:sessionSecret,
  LINE_CHANNEL_ID:"12345678",
  LINE_CHANNEL_SECRET:"test-line-secret",
  ...(enabled?{PASSKEY_REGISTRATION_ENABLED:"true"}:{}),
});
const req=async(path:string,db:FakeDb,enabled:boolean,options:{
  method?:string;origin?:string;cookie?:string|null;json?:boolean;
}={})=>{
  const headers:Record<string,string>={};
  if(options.origin!==undefined)headers.origin=options.origin;
  if(options.json)headers["content-type"]="application/json";
  if(options.cookie!==null)headers.cookie=options.cookie??await signedCookie();
  return worker.fetch(new Request(host+path,{method:options.method??"POST",headers,
    ...((options.method??"POST")==="POST"&&options.json?{body:"{}"}:{})}),makeEnv(db,enabled));
};

test("S2-B disabled flag does not expose registration API or run D1 step-up writes",async()=>{
  const db=new FakeDb(),res=await req("/api/auth/passkey/stepup/start",db,false,{
    origin:host,json:true,
  });
  assert.equal(res.status,404);
  assert.equal(db.stepups,0);
});

test("S2-B enabled step-up requires a session and exact same Origin",async()=>{
  const db=new FakeDb();
  const none=await req("/api/auth/passkey/stepup/start",db,true,{origin:host,json:true,cookie:null});
  assert.equal(none.status,401);
  const cross=await req("/api/auth/passkey/stepup/start",db,true,{origin:"https://evil.example",json:true});
  assert.equal(cross.status,403);
  const missing=await req("/api/auth/passkey/stepup/start",db,true,{json:true});
  assert.equal(missing.status,403);
  const get=await req("/api/auth/passkey/stepup/start",db,true,{origin:host,method:"GET"});
  assert.equal(get.status,403);
  const json=await req("/api/auth/passkey/stepup/start",db,true,{origin:host});
  assert.equal(json.status,415);
  assert.equal(db.stepups,0);
});

test("S2-B enabled start uses linked EXISTING user and fixed-line callback without touching Score",async()=>{
  const db=new FakeDb(),res=await req("/api/auth/passkey/stepup/start",db,true,{
    origin:host,json:true,
  });
  assert.equal(res.status,200);
  const payload=await res.json() as {authorizationUrl:string};
  const u=new URL(payload.authorizationUrl);
  assert.equal(u.searchParams.get("prompt"),"login");
  assert.equal(u.searchParams.get("max_age"),"0");
  assert.equal(u.searchParams.get("redirect_uri"),host+"/api/auth/line/callback");
  assert.equal(db.stepups,1);
  assert.ok(res.headers.get("set-cookie")?.includes("Max-Age=0"));
  assert.equal(db.prepared.filter(x=>x.includes("INSERT INTO users")).length,0);
  assert.equal(db.prepared.filter(x=>/\b(game_results|group_players|players)\b/.test(x)).length,0);
});

test("S2-B no proof means OPTIONS and VERIFY are denied; wrong content type is rejected",async()=>{
  const db=new FakeDb();
  const noProof=await req("/api/auth/passkey/register/options",db,true,{origin:host,json:true});
  assert.equal(noProof.status,403);
  const invalidType=await req("/api/auth/passkey/register/options",db,true,{origin:host});
  assert.equal(invalidType.status,415);
  const noVerify=await req("/api/auth/passkey/register/verify",db,true,{origin:host,json:true});
  assert.equal(noVerify.status,403);
  assert.equal(db.stepups,0);
});

test("S2-B read-only capability is disabled unless server explicitly enables it",async()=>{
  const db=new FakeDb();
  const disabled=await req("/api/auth/passkey/capabilities",db,false,{method:"GET",cookie:null});
  assert.equal(disabled.status,200);
  assert.deepEqual(await disabled.json(),{registrationEnabled:false});
  assert.equal(disabled.headers.get("cache-control"),"no-store");
  const enabled=await req("/api/auth/passkey/capabilities",db,true,{method:"GET",cookie:null});
  assert.equal(enabled.status,200);
  assert.deepEqual(await enabled.json(),{registrationEnabled:true});
  const write=await req("/api/auth/passkey/capabilities",db,true,{method:"POST",json:true});
  assert.equal(write.status,405);
  assert.equal(db.stepups,0);
  assert.deepEqual(db.prepared,[]);
});
