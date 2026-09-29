import test from "node:test";
import assert from "node:assert/strict";
import { finishLineLogin } from "../src/worker/auth/line-login";

class Statement {
  values:unknown[]=[];
  constructor(readonly sql:string,private readonly consumed:boolean){}
  bind(...values:unknown[]){this.values=values;return this;}
  async first<T>():Promise<T|null>{
    if(this.sql.includes("used_at IS NULL"))return null;
    if(this.sql.includes("used_at IS NOT NULL")&&this.consumed)return {usedAt:new Date().toISOString()} as T;
    return null;
  }
  async run(){return {meta:{changes:0}};}
}

class FakeDb {
  constructor(private readonly consumed:boolean){}
  prepare(sql:string){return new Statement(sql,this.consumed);}
}

const secret="test-session-secret-at-least-32-characters";
const env=(consumed=true)=>({
  DB:new FakeDb(consumed) as unknown as D1Database,
  LINE_CHANNEL_ID:"1234567890",
  LINE_CHANNEL_SECRET:"line-secret",
  AUTH_SESSION_SECRET:secret,
});

const base64url=(bytes:Uint8Array)=>Buffer.from(bytes).toString("base64url");
const sessionCookie=async(userId:string)=>{
  const payload=base64url(new TextEncoder().encode(JSON.stringify({userId,exp:Math.floor(Date.now()/1000)+60})));
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=base64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload))));
  return `${payload}.${signature}`;
};

const captureAudit=async(run:()=>Promise<Response>)=>{
  const original=console.info;
  const lines:string[]=[];
  console.info=(...args:unknown[])=>{lines.push(args.map(String).join(" "));};
  try{
    const response=await run();
    return {response,events:lines.map(line=>JSON.parse(line) as Record<string,unknown>)};
  }finally{
    console.info=original;
  }
};

test("recently consumed LINE state is treated as an idempotent duplicate without minting a new session",async()=>{
  const {response,events}=await captureAudit(()=>finishLineLogin(
    new Request("https://mahjong.example/api/auth/line/callback?code=duplicate-code&state=duplicate-state"),
    env(),
  ));

  assert.equal(response.status,302);
  assert.equal(response.headers.get("location"),"https://mahjong.example/");
  assert.equal(response.headers.get("set-cookie"),null);
  assert.equal(response.headers.get("cache-control"),"no-store");
  const duplicate=events.find(event=>event.event==="line_login_duplicate_callback");
  assert.ok(duplicate);
  assert.equal(duplicate.outcome,"success");
  assert.equal(duplicate.reason,"session_missing");
});

test("duplicate LINE callback preserves an already-valid application session",async()=>{
  const session=await sessionCookie("user-1");
  const {response,events}=await captureAudit(()=>finishLineLogin(
    new Request("https://mahjong.example/api/auth/line/callback?code=duplicate-code&state=duplicate-state",{headers:{cookie:`mahjong_session=${session}`}}),
    env(),
  ));

  assert.equal(response.status,302);
  assert.equal(response.headers.get("location"),"https://mahjong.example/?login=success");
  assert.equal(response.headers.get("set-cookie"),null);
  const duplicate=events.find(event=>event.event==="line_login_duplicate_callback");
  assert.ok(duplicate);
  assert.equal(duplicate.userId,"user-1");
  assert.equal(duplicate.reason,"session_preserved");
});

test("unknown or expired LINE state remains rejected",async()=>{
  const response=await finishLineLogin(
    new Request("https://mahjong.example/api/auth/line/callback?code=invalid-code&state=unknown-state"),
    env(false),
  );

  assert.equal(response.status,400);
  assert.equal(await response.text(),"Invalid LINE Login state");
});
