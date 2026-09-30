import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker";
import { AUTH_SESSION_TTL_SECONDS } from "../src/worker/auth/line-login";

const secret="test-session-secret-at-least-32-characters";
const enc=new TextEncoder();
const base64url=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const signedCookie=async(userId:string,exp:number)=>{
  const payload=base64url(enc.encode(JSON.stringify({userId,exp})));
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=base64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(payload))));
  return `mahjong_session=${payload}.${sig}`;
};

class AuthStatement {
  constructor(private readonly sql:string){}
  bind(){return this;}
  async first<T>():Promise<T|null>{
    if(this.sql.includes("FROM users WHERE id=?"))return {id:"u1",displayName:"User",systemRole:"user"} as T;
    if(this.sql.includes("system_role='admin'"))return {ok:1} as T;
    return null;
  }
  async all<T>():Promise<{results:T[]}>{return {results:[]};}
}
class AuthDb {prepare(sql:string){return new AuthStatement(sql);}}
const env={DB:new AuthDb() as unknown as D1Database,ASSETS:{fetch:async()=>new Response("asset")} as unknown as Fetcher,AUTH_SESSION_SECRET:secret};

const decodedExpiry=(setCookie:string)=>{
  const raw=/mahjong_session=([^;]+)/.exec(setCookie)?.[1];
  assert.ok(raw);
  const payload=raw.split(".")[0].replace(/-/g,"+").replace(/_/g,"/");
  return (JSON.parse(Buffer.from(payload,"base64").toString("utf8")) as {exp:number}).exp;
};

test("auth/me does not renew a session with more than 12 hours remaining",async()=>{
  const now=Math.floor(Date.now()/1000);
  const response=await worker.fetch(new Request("https://example.test/api/auth/me",{headers:{cookie:await signedCookie("u1",now+13*60*60)}}),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get("set-cookie"),null);
});

test("auth/me renews signed exp and cookie lifetime inside the 12 hour window",async()=>{
  const now=Math.floor(Date.now()/1000);
  const oldExp=now+11*60*60;
  const response=await worker.fetch(new Request("https://example.test/api/auth/me",{headers:{cookie:await signedCookie("u1",oldExp)}}),env);
  assert.equal(response.status,200);
  const setCookie=response.headers.get("set-cookie")??"";
  assert.match(setCookie,/Max-Age=86400/);
  const renewedExp=decodedExpiry(setCookie);
  assert.ok(renewedExp>oldExp);
  assert.ok(Math.abs(renewedExp-(Math.floor(Date.now()/1000)+AUTH_SESSION_TTL_SECONDS))<=2);
  assert.equal(response.headers.get("cache-control"),"no-store");
});

test("auth/me still rejects an idle expired session",async()=>{
  const response=await worker.fetch(new Request("https://example.test/api/auth/me",{headers:{cookie:await signedCookie("u1",Math.floor(Date.now()/1000)-1)}}),env);
  assert.equal(response.status,401);
});
