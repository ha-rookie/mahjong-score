import test from "node:test";
import assert from "node:assert/strict";
import { finishLineLogin, startLineLogin } from "../src/worker/auth/line-login";

class Statement {
  values:unknown[]=[];
  constructor(readonly sql:string){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{return null;}
  async run(){return {meta:{changes:0}};}
}

class FakeDb {
  prepare(sql:string){return new Statement(sql);}
  async batch(statements:Statement[]){return statements.map(()=>({meta:{changes:1}}));}
}

const env=()=>({
  DB:new FakeDb() as unknown as D1Database,
  LINE_CHANNEL_ID:"1234567890",
  LINE_CHANNEL_SECRET:"line-secret",
  AUTH_SESSION_SECRET:"test-session-secret-at-least-32-characters",
});

const flowIdFor=async(state:string)=>{
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(state));
  return Buffer.from(digest).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"").slice(0,12);
};

const captureAudit=async(run:()=>Promise<void>)=>{
  const original=console.info;
  const lines:string[]=[];
  console.info=(...args:unknown[])=>{lines.push(args.map(String).join(" "));};
  try{await run();}finally{console.info=original;}
  return lines.map(line=>JSON.parse(line) as Record<string,unknown>);
};

test("LINE OAuth start logs only a derived flow id, not raw state or nonce",async()=>{
  let state="",nonce="";
  const events=await captureAudit(async()=>{
    const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start",{headers:{"cf-ray":"ray-start"}}),env());
    const location=response.headers.get("location");
    assert.ok(location);
    const authorizeUrl=new URL(location);
    state=authorizeUrl.searchParams.get("state")??"";
    nonce=authorizeUrl.searchParams.get("nonce")??"";
    assert.ok(state);
    assert.ok(nonce);
  });

  const started=events.find(event=>event.event==="line_login_started");
  assert.ok(started);
  assert.equal(started.requestId,"ray-start");
  assert.equal(started.oauthFlowId,await flowIdFor(state));
  const serialized=JSON.stringify(started);
  assert.equal(serialized.includes(state),false);
  assert.equal(serialized.includes(nonce),false);
});

test("LINE OAuth callback failure uses the same derived flow id for the same state",async()=>{
  let state="",startFlowId="";
  const startEvents=await captureAudit(async()=>{
    const response=await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
    const location=response.headers.get("location");
    assert.ok(location);
    state=new URL(location).searchParams.get("state")??"";
    assert.ok(state);
  });
  startFlowId=String(startEvents.find(event=>event.event==="line_login_started")?.oauthFlowId??"");
  assert.ok(startFlowId);

  const callbackEvents=await captureAudit(async()=>{
    const response=await finishLineLogin(new Request(`https://mahjong.example/api/auth/line/callback?code=test-code&state=${encodeURIComponent(state)}`,{headers:{"cf-ray":"ray-callback"}}),env());
    assert.equal(response.status,400);
    assert.equal(await response.text(),"Invalid LINE Login state");
  });

  const failure=callbackEvents.find(event=>event.event==="line_login_failure");
  assert.ok(failure);
  assert.equal(failure.reason,"state_invalid_or_expired");
  assert.equal(failure.requestId,"ray-callback");
  assert.equal(failure.oauthFlowId,startFlowId);
  assert.equal(JSON.stringify(failure).includes(state),false);
});

test("different LINE OAuth starts produce different flow ids",async()=>{
  const events=await captureAudit(async()=>{
    await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
    await startLineLogin(new Request("https://mahjong.example/api/auth/line/start"),env());
  });
  const flowIds=events.filter(event=>event.event==="line_login_started").map(event=>String(event.oauthFlowId));
  assert.equal(flowIds.length,2);
  assert.notEqual(flowIds[0],flowIds[1]);
});
