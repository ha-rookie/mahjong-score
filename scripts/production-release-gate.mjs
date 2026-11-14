/** Fail-closed Production Release validation. Only local JSON / environment
 * values are examined; GitHub API reads are performed by the calling workflow.
 * No remote D1 or Cloudflare access happens in this module.
 */
import fs from "node:fs";
import path from "node:path";
import { appliedProductionMigrationNames } from "./migration-safety-policy.mjs";

const SHA=/^[0-9a-f]{40}$/;
const deny=(message)=>{throw new Error("Production release DENIED: "+message);};
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8"));

export function verifyReleaseContext(input) {
  const {event,ref,approvedSha,dispatchSha,checkoutSha,mainSha,attempt}=input;
  if(event!=="workflow_dispatch"||ref!=="refs/heads/main")deny("not a manual main dispatch");
  if(!SHA.test(approvedSha??""))deny("expected exact lowercase 40-character SHA");
  if(![dispatchSha,checkoutSha,mainSha].every(v=>v===approvedSha))
    deny("SHA differs from checked-out, dispatch, or current main");
  if(String(attempt)!=="1")deny("reruns are unsafe after possibly partial Migration");
  return true;
}
export function verifyEnvironment(environment,policy) {
  if(environment?.name!=="production")deny("production Environment does not exist");
  const rules=environment.protection_rules;
  const reviewerRule=Array.isArray(rules)?rules.find(x=>x.type==="required_reviewers"):null;
  if(!reviewerRule||!Array.isArray(reviewerRule.reviewers)||reviewerRule.reviewers.length<1)
    deny("Required reviewers are not configured");
  if(reviewerRule.reviewers.some(x=>!x?.reviewer||!["User","Team"].includes(x.type)))
    deny("Invalid Required reviewers rule");
  // The REST Environment response may omit this field. Unknown is NOT safe.
  // Until an authoritative false value is available, block all releases.
  if(environment.can_admins_bypass!==false)
    deny("Admin bypass is enabled or cannot be independently verified");
  const branch=environment.deployment_branch_policy;
  if(!branch||branch.custom_branch_policies!==true||branch.protected_branches!==false)
    deny("custom main-only branch protection is absent");
  if(policy?.total_count!==1||!Array.isArray(policy.branch_policies)||
     policy.branch_policies.length!==1||policy.branch_policies[0]?.name!=="main")
    deny("only the exact main deployment branch is permitted");
  return true;
}
export function verifyNoEarlierRelease(runs,ownRunId,approvedSha) {
  if(!SHA.test(approvedSha??""))deny("invalid SHA for duplicate guard");
  if(!Number.isSafeInteger(Number(ownRunId))||Number(ownRunId)<=0)
    deny("invalid GitHub run ID");
  if(!Array.isArray(runs?.workflow_runs)||!Number.isInteger(runs?.total_count)||
     runs.total_count>100||runs.total_count<runs.workflow_runs.length)
    deny("workflow run history is incomplete or untrusted");
  const found=runs.workflow_runs.find(x=>Number(x.id)===Number(ownRunId));
  if(!found||found.head_sha!==approvedSha||found.event!=="workflow_dispatch")
    deny("current release dispatch not confirmed");
  if(runs.workflow_runs.some(x=>Number(x.id)!==Number(ownRunId)&&
    x.event==="workflow_dispatch"&&x.head_sha===approvedSha))
    deny("another workflow already attempted this exact SHA; manual recovery required");
  return true;
}
export function verifyApprovedMigrations(approved,files,applied) {
  if(typeof approved!=="string"||!Array.isArray(files)||!Array.isArray(applied))
    deny("migration approval data missing");
  const expected=files.filter(x=>x.endsWith(".sql")&&!applied.includes(x)).sort();
  if(expected.some(x=>!/^\d{4}_[a-z0-9_]+\.sql$/.test(x)))
    deny("unexpected migration filename");
  const received=approved==="none"?[]:approved.split(",").map(x=>x.trim());
  if(received.some(x=>!x||!/^\d{4}_[a-z0-9_]+\.sql$/.test(x))||
     new Set(received).size!==received.length)
    deny("malformed/duplicate approved migration filenames");
  if(received.length!==expected.length||expected.some((x,i)=>received[i]!==x))
    deny("approved migrations do not exactly match immutable source plan");
  return true;
}

/**
 * Cloudflare D1 query API returns {success:true,result:[{success:true,results:[{name}]}]}.
 * Read the *actual* D1 migration ledger; never infer applied state from
 * a source-code baseline or a formatted Wrangler terminal table.
 */
export function readRemoteAppliedMigrations(response){
  if(response?.success!==true||!Array.isArray(response.result)||
     response.result.length!==1||response.result[0]?.success!==true||
     !Array.isArray(response.result[0].results))
    deny("remote D1 migration ledger is unavailable, truncated or malformed");
  const rows=response.result[0].results;
  const names=rows.map(row=>row?.name);
  if(names.some(x=>typeof x!=="string"||!/^[0-9]{4}_[a-z0-9_]+\\.sql$/.test(x))||
     new Set(names).size!==names.length)
    deny("remote D1 migration ledger contains malformed or duplicate names");
  return names;
}
export function verifyRemoteMigrationPlan(response,sourceFiles,approved,stage){
  if(!["before","after"].includes(stage))deny("invalid remote migration verification stage");
  if(!Array.isArray(sourceFiles))deny("source migration list unavailable");
  const source=sourceFiles.filter(x=>x.endsWith(".sql")).sort();
  if(source.length===0||source.some(x=>!/^[0-9]{4}_[a-z0-9_]+\\.sql$/.test(x))||
     new Set(source).size!==source.length)
    deny("source migration list is malformed or empty");
  const applied=readRemoteAppliedMigrations(response);
  // D1 migrations are applied sequentially: an unknown, reordered, or
  // missing historical row means remote state is not safely understood.
  if(applied.length>source.length||
     applied.some((name,i)=>name!==source[i]))
    deny("remote D1 applied migration ledger is not an exact source prefix");
  if(applied.length<appliedProductionMigrationNames.length||
     appliedProductionMigrationNames.some((name,i)=>applied[i]!==name))
    deny("remote D1 is missing immutable Production baseline migrations");
  if(stage==="before"){
    verifyApprovedMigrations(approved,source,applied);
    return source.slice(applied.length);
  }
  if(applied.length!==source.length)
    deny("remote D1 still has unapplied migrations after apply");
  return [];
}

export function verifyProductionD1Information(info,config) {
  const intended=config?.d1_databases?.find(x=>x.binding==="DB");
  const uuid=info?.uuid??info?.database?.uuid??info?.database_id;
  const name=info?.name??info?.database?.name;
  if(!intended?.database_id||!intended?.database_name||
     !/^[a-f0-9-]{36}$/.test(intended.database_id)||
     intended.preview_database_id===intended.database_id||
     uuid!==intended.database_id||name!==intended.database_name)
    deny("remote D1 identity does not match pinned Production binding");
  return true;
}
export function verifyRecoveryPoint(info){
  // Wrangler's JSON formatter may expose bookmark at the top level;
  // the Cloudflare API response uses result.bookmark. No silent fallback
  // when neither one is present or the response contains an error.
  if(info?.success===false)deny("D1 Recovery Point request failed");
  const bookmark=info?.bookmark??info?.result?.bookmark;
  if(typeof bookmark!=="string"||bookmark.length<4)
    deny("D1 Recovery Point bookmark missing");
  return true;
}
export function verifyEnvArmed(value){
  if(value!=="armed-for-production-release")
    deny("explicit Environment-only arming secret is missing");
  return true;
}

function cli() {
  const mode=process.argv[2];
  if(mode==="context")verifyReleaseContext({
    event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,
    approvedSha:process.env.RELEASE_SHA,dispatchSha:process.env.GITHUB_SHA,
    checkoutSha:process.env.CHECKOUT_SHA,mainSha:process.env.MAIN_SHA,
    attempt:process.env.GITHUB_RUN_ATTEMPT,
  });
  else if(mode==="environment")verifyEnvironment(read(process.argv[3]),read(process.argv[4]));
  else if(mode==="duplicate")verifyNoEarlierRelease(
    read(process.argv[3]),process.env.GITHUB_RUN_ID,process.env.RELEASE_SHA);
  else if(mode==="migrations")verifyApprovedMigrations(
    process.env.APPROVED_MIGRATIONS,
    fs.readdirSync(path.join(process.cwd(),"migrations")),
    appliedProductionMigrationNames);
  else if(mode==="remote-migrations")verifyRemoteMigrationPlan(
    read(process.argv[4]),fs.readdirSync(path.join(process.cwd(),"migrations")),
    process.env.APPROVED_MIGRATIONS,process.argv[3]);
  else if(mode==="d1-info")verifyProductionD1Information(
    read(process.argv[3]),JSON.parse(
      fs.readFileSync("wrangler.jsonc","utf8").replace(/^\s*\/\/.*$/gm,"")));
  else if(mode==="recovery")verifyRecoveryPoint(read(process.argv[3]));
  else if(mode==="arming")verifyEnvArmed(process.env.PRODUCTION_RELEASE_ARMED);
  else deny("unknown release validation mode");
  console.log("Production release gate passed: "+mode);
}
if(process.argv[1]?.endsWith("/production-release-gate.mjs")) {
  try { cli(); }
  catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}
