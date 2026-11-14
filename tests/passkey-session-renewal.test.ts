import assert from "node:assert/strict";
import test from "node:test";
import {authMe, AUTH_SESSION_RENEW_WINDOW_SECONDS} from "../src/worker/auth/line-login";

const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64url");
const secret="P1 renewal regression test secret with enough entropy 12345";
const userId="existing-user-1";
const hash=async(value:string)=>b64(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))));
const signed=async(ttlSeconds=3600)=>{
  const payload=b64(enc.encode(JSON.stringify({
    userId,exp:Math.floor(Date.now()/1000)+ttlSeconds,authVersion:0,
  })));
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return payload+"."+b64(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
};
class FakeDB {
  validProof=true;
  proofReads=0;
  expectedSessionHash="";
  async setup(cookieValue:string){
    this.expectedSessionHash=await hash(cookieValue);
  }
  prepare(sql:string){
    const proofIsValid=()=>this.validProof;
    const boundSessionHash=()=>this.expectedSessionHash;
    const recordRead=()=>{this.proofReads++;};
    let params:unknown[]=[];
    return {
      bind(...args:unknown[]){params=args;return this;},
      async first<T>():Promise<T|null>{
        if(sql.includes("SELECT id,auth_version AS authVersion FROM users WHERE id=?")){
          return params[0]===userId?{id:userId,authVersion:0} as T:null;
        }
        if(sql.startsWith("SELECT id,display_name AS displayName,system_role AS systemRole FROM users")){
          return {id:userId,displayName:"Existing member",systemRole:"user"} as T;
        }
        if(sql.startsWith("SELECT 1 AS ok FROM users WHERE system_role='admin' LIMIT 1")){
          return {ok:1} as T;
        }
        if(sql.startsWith("SELECT 1 AS ok FROM passkey_line_stepups WHERE user_id=?")){
          recordRead();
          const [requestedUser,sessionHash,since,until]=params;
          const recent=new Date().toISOString();
          if(proofIsValid()&&requestedUser===userId&&
             sessionHash===boundSessionHash()&&recent>=String(since)&&recent<=String(until)){
            return {ok:1} as T;
          }
          return null;
        }
        throw new Error("Unexpected auth/me SELECT "+sql);
      },
      async all<T>():Promise<{results:T[]}>{
        if(sql.startsWith("SELECT gm.group_id AS groupId"))return {results:[]};
        throw new Error("Unexpected auth/me list "+sql);
      },
    };
  }
}
// Browser does not send a Path=/api/auth/passkey cookie to /api/auth/me.
const request=(cookieValue:string)=>
  new Request("https://mahjong-score.ha-rookie.workers.dev/api/auth/me",{
    headers:{cookie:"mahjong_session="+cookieValue},
  });
const env=(db:FakeDB,enabled=true)=>({
  DB:db as unknown as D1Database,
  AUTH_SESSION_SECRET:secret,
  ...(enabled?{PASSKEY_REGISTRATION_ENABLED:"true"}:{}),
});
test("P1 signed session is not rotated by auth/me while a matching step-up proof is valid",async()=>{
  const cookie=await signed(3600),db=new FakeDB();
  await db.setup(cookie);
  const response=await authMe(request(cookie),env(db));
  assert.equal(response.status,200);
  assert.equal((await response.json() as {authenticated:boolean}).authenticated,true);
  assert.equal(response.headers.get("set-cookie"),null);
  assert.equal(db.proofReads,1);
});
test("P1 invalid, expired, other-session and absent proof cannot suppress normal renewal",async()=>{
  const cookie=await signed(3600),db=new FakeDB();
  await db.setup(cookie);
  db.validProof=false;
  const invalid=await authMe(request(cookie),env(db));
  assert.equal(invalid.status,200);
  assert.match(invalid.headers.get("set-cookie")??"",/^mahjong_session=/);
  db.validProof=true;
  db.expectedSessionHash=await hash("different-signed-cookie");
  const mismatched=await authMe(request(cookie),env(db));
  assert.match(mismatched.headers.get("set-cookie")??"",/^mahjong_session=/);
  await db.setup(cookie);
  db.validProof=false;
  const absent=await authMe(request(cookie),env(db));
  assert.match(absent.headers.get("set-cookie")??"",/^mahjong_session=/);
});
test("P1 flag off preserves ordinary cookie renewal without touching P1 proof DB",async()=>{
  const cookie=await signed(3600),db=new FakeDB();
  await db.setup(cookie);
  const response=await authMe(request(cookie),env(db,false));
  assert.equal(response.status,200);
  assert.match(response.headers.get("set-cookie")??"",/^mahjong_session=/);
  assert.equal(db.proofReads,0);
});
test("P1 proof does not change renewal policy for a cookie outside the renewal window",async()=>{
  const cookie=await signed(AUTH_SESSION_RENEW_WINDOW_SECONDS+5000),db=new FakeDB();
  await db.setup(cookie);
  const response=await authMe(request(cookie),env(db));
  assert.equal(response.status,200);
  assert.equal(response.headers.get("set-cookie"),null);
  assert.equal(db.proofReads,0);
});
