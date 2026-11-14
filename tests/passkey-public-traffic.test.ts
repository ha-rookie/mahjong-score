import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {handleLineFreePasskey} from "../src/worker/auth/passkey-line-free-http";
import {
  admitPublicPasskeyOptions,pruneExpiredPasskeyState,
  PublicPasskeyRateLimited,PASSKEY_IP_BUDGET,PASSKEY_GLOBAL_BUDGET,
} from "../src/worker/auth/passkey-public-traffic";

const origin="https://mahjong-score.ha-rookie.workers.dev";
class D1 {
  sqlite=new DatabaseSync(":memory:");
  constructor(){
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    for(const file of readdirSync("migrations").filter(x=>/^\d.*\.sql$/.test(x)).sort())
      this.sqlite.exec(readFileSync("migrations/"+file,"utf8"));
  }
  close(){this.sqlite.close();}
  query(sql:string,...args:SQLInputValue[]){
    return this.sqlite.prepare(sql).all(...args).map(x=>({...x})) as Array<Record<string,unknown>>;
  }
  prepare(sql:string){
    const statement=this.sqlite.prepare(sql);
    let params:SQLInputValue[]=[];
    const convert=(value:unknown):SQLInputValue=>{
      if(value instanceof Uint8Array)return Buffer.from(value);
      if(value===null||typeof value==="number"||typeof value==="string"||typeof value==="bigint")
        return value;
      throw new Error("Unsupported D1 parameter");
    };
    return {
      bind(...v:unknown[]){params=v.map(convert);return this;},
      async first<T>():Promise<T|null>{const row=statement.get(...params);return row?row as T:null;},
      async all<T>():Promise<{results:T[]}>{return{results:statement.all(...params) as T[]};},
      async run(){const r=statement.run(...params);return{meta:{changes:Number(r.changes)}};},
    };
  }
}
const db=(x:D1)=>x as unknown as D1Database;
const req=(ip:string|null,path="/api/auth/passkey/login/options",xff?:string)=>{
  const headers:Record<string,string>={"origin":origin,"content-type":"application/json"};
  if(ip!==null)headers["cf-connecting-ip"]=ip;
  if(xff)headers["x-forwarded-for"]=xff;
  return new Request(origin+path,{method:"POST",headers,body:"{}"});
};
const options=async(database:D1,ip:string|null,path="/api/auth/passkey/login/options")=>
  handleLineFreePasskey(req(ip,path),{DB:db(database),AUTH_SESSION_SECRET:"test-local-only-session-secret"});
const scalar=(d:D1,table:string)=>Number(d.query("SELECT COUNT(*) AS n FROM "+table)[0].n);

test("P0 public options refuse missing/malformed Cloudflare IP even with forged X-Forwarded-For",async()=>{
  const d=new D1();
  try{
    const bad=[
      req(null,undefined,"203.0.113.99"),req("invalid-client-ip"),req("203.0.113.1,203.0.113.2"),
    ];
    for(const request of bad){
      const r=await handleLineFreePasskey(request,{DB:db(d),AUTH_SESSION_SECRET:"test"});
      assert.equal(r?.status,429);
      assert.equal(r?.headers.get("retry-after"),"300");
    }
    assert.equal(scalar(d,"auth_challenges"),0);
    assert.equal(scalar(d,"passkey_option_budgets"),0);
  }finally{d.close();}
});

test("P0 same-IP limit is atomic: at most eight challenges, no D1 writes after rejection",async()=>{
  const d=new D1();
  try{
    const responses=await Promise.all(Array.from({length:24},()=>options(d,"203.0.113.10")));
    assert.equal(responses.filter(x=>x?.status===200).length,PASSKEY_IP_BUDGET);
    assert.equal(responses.filter(x=>x?.status===429).length,24-PASSKEY_IP_BUDGET);
    const count=scalar(d,"auth_challenges");
    assert.equal(count,PASSKEY_IP_BUDGET);
    const before=d.query("SELECT bucket,attempts FROM passkey_option_budgets ORDER BY bucket");
    for(let i=0;i<6;i++) assert.equal((await options(d,"203.0.113.10"))?.status,429);
    assert.equal(scalar(d,"auth_challenges"),count);
    assert.deepEqual(d.query("SELECT bucket,attempts FROM passkey_option_budgets ORDER BY bucket"),before);
  }finally{d.close();}
});

test("P0 global cap denies a distributed-IP flood without writing another challenge",async()=>{
  const d=new D1();
  try{
    for(let ip=1;ip<=5;ip++){
      for(let i=0;i<PASSKEY_IP_BUDGET;i++){
        const r=await options(d,"203.0.113."+ip);
        assert.equal(r?.status,200);
      }
    }
    assert.equal(scalar(d,"auth_challenges"),PASSKEY_GLOBAL_BUDGET);
    const before=d.query("SELECT bucket,attempts FROM passkey_option_budgets ORDER BY bucket");
    for(let ip=6;ip<=10;ip++)assert.equal((await options(d,"203.0.113."+ip))?.status,429);
    assert.equal(scalar(d,"auth_challenges"),PASSKEY_GLOBAL_BUDGET);
    assert.deepEqual(d.query("SELECT bucket,attempts FROM passkey_option_budgets ORDER BY bucket"),before);
  }finally{d.close();}
});

test("P0 token-based invite/recovery options share the login budget",async()=>{
  const d=new D1();
  try{
    for(let i=0;i<PASSKEY_IP_BUDGET;i++)assert.equal((await options(d,"203.0.113.31"))?.status,200);
    for(const path of ["/api/auth/passkey/invite/options","/api/auth/passkey/recovery/options"]){
      const response=await handleLineFreePasskey(new Request(origin+path,{
        method:"POST",headers:{origin,"cf-connecting-ip":"203.0.113.31","content-type":"application/json"},
        body:JSON.stringify({token:"A".repeat(43)}),
      }),{DB:db(d),AUTH_SESSION_SECRET:"test"});
      assert.equal(response?.status,429);
    }
    assert.equal(scalar(d,"auth_challenges"),PASSKEY_IP_BUDGET);
  }finally{d.close();}
});

test("P0 budget rolls over only with server time, not a client header",async()=>{
  const d=new D1();
  try{
    const now=new Date("2026-11-14T08:00:00.000Z");
    for(let i=0;i<PASSKEY_IP_BUDGET;i++)await admitPublicPasskeyOptions(db(d),req("203.0.113.55"),now);
    await assert.rejects(admitPublicPasskeyOptions(db(d),req("203.0.113.55"),now),PublicPasskeyRateLimited);
    await admitPublicPasskeyOptions(db(d),req("203.0.113.55"),new Date(now.getTime()+300_000));
    const global=d.query("SELECT attempts FROM passkey_option_budgets WHERE bucket LIKE 'g:%'");
    assert.deepEqual(global.map(x=>x.attempts),[8,1]);
  }finally{d.close();}
});

test("P0 pruning deletes only expired-for-24h challenges, max 32 each pass, retains live and recently expired",async()=>{
  const d=new D1();
  try{
    const now=new Date("2026-11-14T09:00:00.000Z");
    const oldExpires="2026-11-13T07:00:00.000Z";
    const recentExpires="2026-11-14T08:00:00.000Z";
    const liveExpires="2026-11-14T10:00:00.000Z";
    const add=(id:string,expires:string)=>d.sqlite.prepare(
      "INSERT INTO auth_challenges(id,challenge_hash,purpose,expected_origin,rp_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?)"
    ).run(id,"test-digest","login",origin,"mahjong-score.ha-rookie.workers.dev","2026-11-12T00:00:00.000Z",expires);
    for(let i=0;i<50;i++)add("expired-"+i,oldExpires);
    add("recent",recentExpires);add("live",liveExpires);
    for(let i=0;i<50;i++)d.sqlite.prepare(
      "INSERT INTO passkey_option_budgets(bucket,window_start,attempts) VALUES(?,?,1)"
    ).run("stale-"+i,"2026-11-13T07:00:00.000Z");
    d.sqlite.prepare("INSERT INTO passkey_option_budgets(bucket,window_start,attempts) VALUES(?,?,1)").run("current","2026-11-14T08:00:00.000Z");
    assert.deepEqual(await pruneExpiredPasskeyState(db(d),now),{challenges:32,budgets:32});
    assert.equal(scalar(d,"auth_challenges"),20);
    assert.equal(scalar(d,"passkey_option_budgets"),19);
    assert.deepEqual(await pruneExpiredPasskeyState(db(d),now),{challenges:18,budgets:18});
    assert.equal(scalar(d,"auth_challenges"),2);
    assert.equal(scalar(d,"passkey_option_budgets"),1);
    assert.deepEqual(d.query("SELECT id FROM auth_challenges ORDER BY id").map(x=>x.id),["live","recent"]);
    assert.deepEqual(await pruneExpiredPasskeyState(db(d),now),{challenges:0,budgets:0});
  }finally{d.close();}
});
