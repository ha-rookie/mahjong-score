import test from "node:test";
import assert from "node:assert/strict";
import { startLineLogin } from "../src/worker/auth/line-login";

class Statement {
  constructor(readonly sql:string){}
  bind(...values:unknown[]){void values;return this;}
}

class FakeDb {
  prepare(sql:string){return new Statement(sql);}
  async batch(statements:Statement[]){return statements.map(()=>({meta:{changes:1}}));}
}

const env=()=>({DB:new FakeDb() as unknown as D1Database,LINE_CHANNEL_ID:"1234567890"});

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

test("normal browser mode keeps the existing 302 LINE Login flow without caching the one-time authorization transaction",async()=>{
  const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
  assert.equal(response.status,302);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const location=response.headers.get("location");
  assert.ok(location);
  assert.equal(new URL(location).origin,"https://access.line.me");
});

test("each LINE Login start request creates a distinct state and nonce",async()=>{
  const first=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
  const second=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
  const firstUrl=new URL(first.headers.get("location")!);
  const secondUrl=new URL(second.headers.get("location")!);
  assert.notEqual(firstUrl.searchParams.get("state"),secondUrl.searchParams.get("state"));
  assert.notEqual(firstUrl.searchParams.get("nonce"),secondUrl.searchParams.get("nonce"));
});
