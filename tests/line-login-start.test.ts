import test from "node:test";
import assert from "node:assert/strict";
import { finishLineLogin, startLineLogin } from "../src/worker/auth/line-login";

class Statement {
  values:unknown[]=[];
  constructor(readonly db:FakeDb,readonly sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{
    if(this.sql.includes("FROM invitations WHERE token_hash=?")&&this.db.invitationAvailable){
      return {id:"inv1",groupId:"g1",playerId:"p1",expiresAt:"2099-01-01T00:00:00Z"} as T;
    }
    if(this.sql.includes("FROM line_login_states"))return null;
    return null;
  }
  async run(){return {meta:{changes:1}};}
}

class FakeDb {
  invitationAvailable=false;
  prepare(sql:string){return new Statement(this,sql);}
  async batch(statements:Statement[]){return statements.map(()=>({meta:{changes:1}}));}
}

const env=(db=new FakeDb())=>({
  DB:db as unknown as D1Database,
  LINE_CHANNEL_ID:"1234567890",
  LINE_CHANNEL_SECRET:"test-line-secret",
  AUTH_SESSION_SECRET:"test-session-secret-at-least-32-characters",
});

const authorizationUrl=(response:Response)=>{
  const location=response.headers.get("location");
  assert.ok(location);
  return new URL(location);
};

const callbackUrl=(authorization:URL)=>{
  const value=authorization.searchParams.get("redirect_uri");
  assert.ok(value);
  return new URL(value);
};

test("iOS PWA mode can receive the LINE authorize URL without a redirect",async()=>{
  const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start?response=json"),env());
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const payload=await response.json() as {authorizationUrl:string};
  const url=new URL(payload.authorizationUrl);
  assert.equal(url.origin,"https://access.line.me");
  assert.equal(url.pathname,"/oauth2/v2.1/authorize");
  assert.equal(url.searchParams.get("client_id"),"1234567890");
  assert.equal(url.searchParams.get("redirect_uri"),"https://mahjong.example/api/auth/line/callback");
  assert.ok(url.searchParams.get("state"));
  assert.ok(url.searchParams.get("nonce"));
});

test("normal browser mode keeps the 302 LINE Login flow and prevents caching",async()=>{
  const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
  assert.equal(response.status,302);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const url=authorizationUrl(response);
  assert.equal(url.origin,"https://access.line.me");
  assert.equal(url.searchParams.get("disable_auto_login"),null);
  assert.equal(callbackUrl(url).searchParams.get("line_retry"),null);
});

test("manual retry disables LINE auto login and marks the callback as bounded retry",async()=>{
  const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start?disable_auto_login=true"),env());
  assert.equal(response.status,302);
  const url=authorizationUrl(response);
  assert.equal(url.searchParams.get("disable_auto_login"),"true");
  assert.equal(callbackUrl(url).searchParams.get("line_retry"),"1");
});

test("invitation login disables auto login so invitation context is not lost to auto-login state mismatch",async()=>{
  const db=new FakeDb();
  db.invitationAvailable=true;
  const inviteToken="a".repeat(43);
  const response=await startLineLogin(new Request(`https://mahjong.example/api/auth/line/start?invite=${inviteToken}`),env(db));
  assert.equal(response.status,302);
  const url=authorizationUrl(response);
  assert.equal(url.searchParams.get("disable_auto_login"),"true");
  assert.equal(callbackUrl(url).searchParams.get("line_retry"),"1");
});

test("first invalid LINE state is rejected and retried once with auto login disabled",async()=>{
  const response=await finishLineLogin(new Request("https://mahjong.example/api/auth/line/callback?code=invalid-code&state=invalid-state"),env());
  assert.equal(response.status,302);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const url=authorizationUrl(response);
  assert.equal(url.origin,"https://access.line.me");
  assert.equal(url.searchParams.get("disable_auto_login"),"true");
  assert.equal(callbackUrl(url).searchParams.get("line_retry"),"1");
});

test("invalid state after manual retry does not loop and returns to the app login gate",async()=>{
  const response=await finishLineLogin(new Request("https://mahjong.example/api/auth/line/callback?line_retry=1&code=invalid-code&state=invalid-state"),env());
  assert.equal(response.status,302);
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(response.headers.get("location"),"https://mahjong.example/?login=failed");
});
