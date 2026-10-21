import assert from "node:assert/strict";
import test from "node:test";
import { WorkerApiClient } from "../src/infrastructure/api/worker-api-client";
import { isProtectedApiPath } from "../src/infrastructure/api/browser-auth-session";

test("WorkerApiClient maps 401 to an authentication-expiry message",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:"unauthorized",message:"Authentication required"}}),{status:401,headers:{"content-type":"application/json"}});
  try{
    const result=await new WorkerApiClient().request<{ok:boolean}>("/api/groups");
    assert.equal(result.ok,false);
    if(result.ok)return;
    assert.equal(result.error.code,"unauthorized");
    assert.equal(result.error.userMessage,"ログインの有効期限が切れました。もう一度ログインしてください。");
    assert.equal(result.error.retryable,false);
  }finally{globalThis.fetch=original;}
});

test("WorkerApiClient maps a 503 auth store failure to a retryable outage, not a login expiry",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:"auth_service_unavailable",message:"Authentication is temporarily unavailable"}}),{
    status:503,headers:{"content-type":"application/json","retry-after":"30"}
  });
  try{
    const result=await new WorkerApiClient().request<{ok:boolean}>("/api/groups");
    assert.equal(result.ok,false);
    if(result.ok)return;
    assert.equal(result.error.code,"auth_service_unavailable");
    assert.equal(result.error.retryable,true);
    assert.notEqual(result.error.userMessage,"ログインの有効期限が切れました。もう一度ログインしてください。");
  }finally{globalThis.fetch=original;}
});

test("browser auth guard classifies protected and control API paths",()=>{
  assert.equal(isProtectedApiPath("/api/groups"),true);
  assert.equal(isProtectedApiPath("/api/auth/bootstrap-admin"),true);
  assert.equal(isProtectedApiPath("/api/auth/me"),false);
  assert.equal(isProtectedApiPath("/api/auth/line/start"),false);
  assert.equal(isProtectedApiPath("/api/auth/logout"),false);
  assert.equal(isProtectedApiPath("/api/health"),false);
});
