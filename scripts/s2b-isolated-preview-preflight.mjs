/**
 * S2-B (#345): STATIC isolated Preview Worker/D1/LINE manifest guard.
 * No network, secrets, Wrangler execution, D1 writes or deployment.
 * Usage: node scripts/s2b-isolated-preview-preflight.mjs --config <file>
 * The file must be strict JSON (a subset of JSONC).
 */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const fail=(reason)=>{throw new Error("S2-B ISOLATED PREVIEW STOP: "+reason);};
const WORKER="mahjong-score-passkey-s2b-isolated";
const DB_NAME="mahjong-score-passkey-s2b-isolated";
const ORIGIN="https://"+WORKER+".ha-rookie.workers.dev";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const channel=/^[0-9]{6,20}$/;
const onlyKeys=(data,keys)=>
  data!==null&&typeof data==="object"&&!Array.isArray(data)&&
  JSON.stringify(Object.keys(data).sort())===JSON.stringify(keys.slice().sort());
const read=(file)=>{try{return JSON.parse(readFileSync(resolve(file),"utf8"));}catch{fail("missing or invalid JSON: "+file);}};
export const validateIsolatedPreview=(isolated,production,performance)=>{
  if(!onlyKeys(isolated,["$schema","name","compatibility_date","main","preview_urls","vars","d1_databases","assets"]))
    fail("only allowlisted top-level fields permitted; no routes/build/env overrides");
  const prod=production.d1_databases?.find(d=>d.binding==="DB");
  const prev=production.previews?.d1_databases?.find(d=>d.binding==="DB");
  const perf=performance.d1_databases?.find(d=>d.binding==="DB");
  if(!prod?.database_id||!prev?.database_id||!perf?.database_id||
     prod.database_name!=="mahjong-score-prod"||
     prev.database_name!=="mahjong-score-preview"||
     perf.database_name!=="mahjong-score-performance"||
     new Set([prod.database_id,prev.database_id,perf.database_id]).size!==3)
    fail("existing Production/Preview/Performance D1 baselines invalid");
  if(isolated.name!==WORKER||isolated.name===production.name||
     isolated.name===performance.name||
     isolated.main!=="src/worker.ts"||isolated.compatibility_date!=="2026-09-23"||
     isolated.preview_urls!==true)fail("Worker identity, entry point, or compatibility mismatch");
  if(!Array.isArray(isolated.d1_databases)||isolated.d1_databases.length!==1)
    fail("exactly one independent DB binding required");
  const db=isolated.d1_databases[0];
  if(!onlyKeys(db,["binding","database_name","database_id"])||
     db.binding!=="DB"||db.database_name!==DB_NAME||
     !uuid.test(db.database_id??"")||
     [prod.database_id,prev.database_id,perf.database_id].includes(db.database_id))
    fail("isolated DB UUID/name invalid or matches a protected D1");
  if(!onlyKeys(isolated.vars,["PASSKEY_AUTH_ENVIRONMENT","PASSKEY_PREVIEW_ORIGIN","PASSKEY_REGISTRATION_ENABLED","LINE_CHANNEL_ID"]))
    fail("only allowlisted NONSECRET variables are permitted");
  if(isolated.vars.PASSKEY_AUTH_ENVIRONMENT!=="isolated-preview"||
     isolated.vars.PASSKEY_PREVIEW_ORIGIN!==ORIGIN||
     isolated.vars.PASSKEY_REGISTRATION_ENABLED!=="false")
    fail("environment/origin must be pinned and passkey feature must remain OFF");
  if(!channel.test(isolated.vars.LINE_CHANNEL_ID??"")||
     isolated.vars.LINE_CHANNEL_ID===production.vars?.LINE_CHANNEL_ID||
     isolated.vars.LINE_CHANNEL_ID===performance.vars?.LINE_CHANNEL_ID)
    fail("separate numeric LINE test channel required; do not reuse Production");
  if(!onlyKeys(isolated.assets,["binding","not_found_handling","run_worker_first"])||
     isolated.assets.binding!=="ASSETS"||
     isolated.assets.not_found_handling!=="single-page-application"||
     JSON.stringify(isolated.assets.run_worker_first)!=='["/api/*"]')
    fail("asset and API routing mismatch");
  return {worker:isolated.name,origin:ORIGIN,
    d1Name:db.database_name,d1Id:db.database_id,
    lineChannelId:isolated.vars.LINE_CHANNEL_ID,enabled:false};
};
if(process.argv[1]?.endsWith("/s2b-isolated-preview-preflight.mjs")){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=="--config"||!args[1]){
    console.error("Usage: node scripts/s2b-isolated-preview-preflight.mjs --config <config.jsonc>");
    process.exit(2);
  }
  try{
    const root=process.cwd();
    const x=validateIsolatedPreview(read(args[1]),
      read(root+"/wrangler.jsonc"),read(root+"/wrangler.performance.jsonc"));
    console.log("S2-B isolated Preview STATIC manifest check PASS; no Cloudflare connection");
    console.log(JSON.stringify(x,null,2));
    console.log("Remote Worker/D1/LINE channel/callback/secret are NOT verified.");
    console.log("This script never applies migrations, deploys, writes secrets or enables the feature.");
  }catch(e){console.error(String(e));process.exit(1);}
}
