import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Manifest={
  name:string;
  vars:Record<string,string>;
  d1_databases:Array<{binding:string;database_name:string;database_id:string}>;
  [key:string]:unknown;
};
const example=JSON.parse(readFileSync("wrangler.passkey-isolated.example.jsonc","utf8")) as Manifest;
const prod=JSON.parse(readFileSync("wrangler.jsonc","utf8")) as {
  d1_databases:Array<{database_id:string;preview_database_id:string}>;
};
const perf=JSON.parse(readFileSync("wrangler.performance.jsonc","utf8")) as {
  d1_databases:Array<{database_id:string}>;
};
const fresh=():Manifest=>{
  const source=structuredClone(example);
  source.vars.LINE_CHANNEL_ID="9988776655";
  source.d1_databases[0].database_id="f1c2d3e4-1234-4321-8abc-0123456789ab";
  return source;
};
const validate=(manifest:Manifest)=>{
  const dir=mkdtempSync(join(tmpdir(),"s2b-preview-static-"));
  const path=join(dir,"config.jsonc");
  try{
    writeFileSync(path,JSON.stringify(manifest));
    return spawnSync(process.execPath,[
      "scripts/s2b-isolated-preview-preflight.mjs","--config",path,
    ],{cwd:process.cwd(),encoding:"utf8",timeout:20000});
  }finally{rmSync(dir,{recursive:true,force:true});}
};
test("S2-B isolated manifest guard accepts only an independent, OFF-by-default, non-secret Worker",()=>{
  const result=validate(fresh());
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/STATIC manifest check PASS/);
  assert.match(result.stdout,/no Cloudflare connection/);
  assert.match(result.stdout,/"enabled": false/);
});
test("S2-B example is deliberately NON-deployable until approved real values exist",()=>{
  const result=validate(example);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/ISOLATED PREVIEW STOP/);
});
test("S2-B guard rejects protected Production, Preview and Performance DB IDs",()=>{
  for(const id of [prod.d1_databases[0].database_id,
    prod.d1_databases[0].preview_database_id,
    perf.d1_databases[0].database_id]){
    const config=fresh();config.d1_databases[0].database_id=id;
    const result=validate(config);
    assert.notEqual(result.status,0,id);
    assert.match(result.stderr,/ISOLATED PREVIEW STOP/);
  }
});
test("S2-B guard fails closed for wrong Worker, extra DB, forged Origin and enabled flag",()=>{
  const changes:Array<(x:Manifest)=>void>=[
    x=>{x.name="mahjong-score";},
    x=>{x.name="mahjong-score-performance";},
    x=>{x.name="totally-different-worker";},
    x=>{x.vars.PASSKEY_PREVIEW_ORIGIN="https://mahjong-score.ha-rookie.workers.dev";},
    x=>{x.vars.PASSKEY_PREVIEW_ORIGIN="https://another-worker.ha-rookie.workers.dev";},
    x=>{x.vars.PASSKEY_PREVIEW_ORIGIN="http://mahjong-score-passkey-s2b-isolated.ha-rookie.workers.dev";},
    x=>{x.vars.PASSKEY_REGISTRATION_ENABLED="true";},
    x=>{x.vars.PASSKEY_AUTH_ENVIRONMENT="production";},
    x=>{x.vars.LINE_CHANNEL_ID="2011726648";},
    x=>{x.d1_databases[0].database_name="mahjong-score-preview";},
    x=>{x.d1_databases.push({...x.d1_databases[0]});},
    x=>{x.d1_databases[0].database_id="REPLACE";},
    x=>{x.vars.LINE_CHANNEL_SECRET="SHOULD_NOT_BE_CHECKED_IN";},
    x=>{x.vars.AUTH_SESSION_SECRET="SHOULD_NOT_BE_CHECKED_IN";},
    x=>{x.routes=[{pattern:"example.com"}];},
    x=>{x.previews={d1_databases:[{binding:"DB",database_id:prod.d1_databases[0].database_id}]};},
  ];
  for(let i=0;i<changes.length;i++){
    const config=fresh();changes[i](config);
    const result=validate(config);
    assert.notEqual(result.status,0,"variant "+i+" must STOP");
    assert.match(result.stderr,/ISOLATED PREVIEW STOP/);
  }
});
test("S2-B guard never validates missing or unknown target without a config argument",()=>{
  const r=spawnSync(process.execPath,["scripts/s2b-isolated-preview-preflight.mjs"],
    {cwd:process.cwd(),encoding:"utf8",timeout:20000});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/Usage:/);
});
