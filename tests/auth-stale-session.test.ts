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

class MissingUserStatement {
  bind(){return this;}
  async first<T>():Promise<T|null>{return null;}
  async all<T>():Promise<{results:T[]}>{throw new Error("memberships must not be queried for a missing session user");}
}

class MissingUserDb {
  prepare(){return new MissingUserStatement();}
}

test("auth/me rejects a valid signed session when the user does not exist in the current database",async()=>{
  const request=new Request("https://example.test/api/auth/me",{
    headers:{cookie:await sessionCookie("user-from-another-database")},
  });
  const env={
    DB:new MissingUserDb() as unknown as D1Database,
    ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,
    AUTH_SESSION_SECRET:secret,
  };

  const response=await worker.fetch(request,env);
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{authenticated:false});
  assert.match(response.headers.get("set-cookie")??"",/mahjong_session=;/);
  assert.match(response.headers.get("set-cookie")??"",/Max-Age=0/);
});
