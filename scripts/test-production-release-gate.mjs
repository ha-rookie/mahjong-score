import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertReleaseTopology } from "./production-release-policy.mjs";
import {
  verifyReleaseContext,verifyEnvironment,verifyNoEarlierRelease,
  verifyApprovedMigrations,verifyProductionD1Information,
  verifyRecoveryPoint,verifyEnvArmed,readRemoteAppliedMigrations,verifyRemoteMigrationPlan,verifyMigrationApprovalSyntax,
} from "./production-release-gate.mjs";

const ci=fs.readFileSync(".github/workflows/deploy-production.yml","utf8");
const release=fs.readFileSync(".github/workflows/release-production.yml","utf8");
const sha="a".repeat(40);
const context={
  event:"workflow_dispatch",ref:"refs/heads/main",approvedSha:sha,
  dispatchSha:sha,checkoutSha:sha,mainSha:sha,attempt:"1",
};
const environment={
  name:"production",
  protection_rules:[{
    type:"required_reviewers",prevent_self_review:false,
    reviewers:[{type:"User",reviewer:{login:"human-reviewer"}}],
  }],
  deployment_branch_policy:{protected_branches:false,custom_branch_policies:true},
  can_admins_bypass:false,
};
const policy={total_count:1,branch_policies:[{name:"main"}]};
const run={id:123,event:"workflow_dispatch",head_sha:sha,conclusion:null,status:"in_progress"};
const runs={total_count:1,workflow_runs:[run]};
const d1={uuid:"95a84e69-692e-45f1-9762-0b71b298199b",name:"mahjong-score-prod"};
const config={d1_databases:[{
  binding:"DB",database_name:d1.name,database_id:d1.uuid,
  preview_database_id:"2494979f-57d5-4ba5-bde7-bc5ec674b8eb",
}]};

test("CI for main/pull_request remains local only; release is manual only",()=>{
  assert.equal(assertReleaseTopology(ci,release),undefined);
  assert.match(ci,/run: npm run db:migrations:guard/);
  assert.match(ci,/validate-and-deploy:/);
  assert.doesNotMatch(ci,/workflow_dispatch:/);
  assert.doesNotMatch(ci,/CLOUDFLARE_API_TOKEN|npx wrangler deploy/);
  assert.match(release,/environment: production/);
  assert.match(release,/group: mahjong-score-production-release/);
  assert.match(release,/cancel-in-progress: false/);
});
test("Accidental future #358 workflow restore fails original migration guard topology",()=>{
  assert.throws(()=>assertReleaseTopology(ci+"\n  workflow_dispatch:\n",release),/CI may not be manually/);
  assert.throws(()=>assertReleaseTopology(ci+"\n      - run: npx wrangler deploy\n",release),/CI must not hold/);
  assert.throws(()=>assertReleaseTopology(ci+"\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n",release),/CI must not hold/);
  assert.throws(()=>assertReleaseTopology(ci.replace("npm run db:migrations:guard","npm test"),release),/migration guard/);
});
test("Prod workflow fails if any automatic trigger/Environment/single-flight policy reappears",()=>{
  assert.throws(()=>assertReleaseTopology(ci,release.replace("  workflow_dispatch:","  push:\n    branches: [main]\n  workflow_dispatch:")),/trigger/);
  assert.throws(()=>assertReleaseTopology(ci,release.replace("environment: production","environment: staging")),/environment/);
  assert.throws(()=>assertReleaseTopology(ci,release.replace("cancel-in-progress: false","cancel-in-progress: true")),/concurrency/);
  assert.throws(()=>assertReleaseTopology(ci,release.replace("scripts/production-release-gate.mjs environment","missing-release-gate")),/admission/);
});
test("Only first attempt of current pinned main SHA may be released",()=>{
  assert.equal(verifyReleaseContext(context),true);
  const mutated=[
    {event:"push"},{ref:"refs/heads/topic"},{approvedSha:"main"},
    {approvedSha:"A".repeat(40)},{dispatchSha:"b".repeat(40)},
    {checkoutSha:"b".repeat(40)},{mainSha:"b".repeat(40)},{attempt:"2"},
  ];
  for(const replacement of mutated)assert.throws(
    ()=>verifyReleaseContext({...context,...replacement}),/DENIED/);
});
test("GitHub Environment must have actual required human reviewers",()=>{
  assert.equal(verifyEnvironment(environment,policy),true);
  for(const bad of [
    null,{name:"staging"}, {...environment,protection_rules:[]},
    {...environment,protection_rules:[{type:"wait_timer",wait_timer:30}]},
    {...environment,protection_rules:[{type:"required_reviewers",reviewers:[]}]},
    {...environment,can_admins_bypass:true},
    {...environment,can_admins_bypass:undefined},
    {...environment,can_admins_bypass:null},
    {...environment,deployment_branch_policy:null},
    {...environment,deployment_branch_policy:{protected_branches:true,custom_branch_policies:false}},
  ])assert.throws(()=>verifyEnvironment(bad,policy),/DENIED/);
});
test("Missing/excess/non-main branch rules fail closed before Cloudflare",()=>{
  for(const bad of [
    null,{total_count:0,branch_policies:[]},
    {total_count:1,branch_policies:[{name:"release/*"}]},
    {total_count:2,branch_policies:[{name:"main"},{name:"release/*"}]},
    {total_count:2,branch_policies:[{name:"main"}]},
    {total_count:1,branch_policies:[{name:"main"},{name:"dev"}]},
  ])assert.throws(()=>verifyEnvironment(environment,bad),/DENIED/);
});
test("Duplicate dispatch, rerun, inaccessible history or malformed SHA stop",()=>{
  assert.equal(verifyNoEarlierRelease(runs,123,sha),true);
  for(const bad of [
    {total_count:0,workflow_runs:[]},
    {total_count:2,workflow_runs:[run,{id:124,event:"workflow_dispatch",head_sha:sha}]},
    {total_count:101,workflow_runs:[run]},
    {total_count:0,workflow_runs:[run]},
    {workflow_runs:[run]},
    null,
  ])assert.throws(()=>verifyNoEarlierRelease(bad,123,sha),/DENIED/);
  assert.throws(()=>verifyNoEarlierRelease(runs,124,sha),/DENIED/);
  assert.throws(()=>verifyNoEarlierRelease(runs,123,"bad"),/DENIED/);
});
test("Release approval lists exactly all additive source migrations after baseline",()=>{
  const files=["0001_init.sql","0011_auth.sql","0012_recovery.sql","0013_budget.sql"];
  assert.equal(verifyApprovedMigrations("0011_auth.sql,0012_recovery.sql,0013_budget.sql",files,["0001_init.sql"]),true);
  assert.equal(verifyApprovedMigrations("none",["0001_init.sql"],["0001_init.sql"]),true);
  for(const wrong of ["none","0012_recovery.sql","0013_budget.sql,0012_recovery.sql,0011_auth.sql","0011_auth.sql,0011_auth.sql","0011_auth.sql,0012_recovery.sql,0013_budget.sql,0014_unreviewed.sql"]){
    assert.throws(()=>verifyApprovedMigrations(wrong,files,["0001_init.sql"]),/DENIED/);
  }
});
test("Wrong Production D1 UUID, preview ID, name, or missing binding deny mutation",()=>{
  assert.equal(verifyProductionD1Information(d1,config),true);
  for(const bad of [
    null,{uuid:config.d1_databases[0].preview_database_id,name:d1.name},
    {...d1,name:"mahjong-score-preview"},
    {name:d1.name},
  ])assert.throws(()=>verifyProductionD1Information(bad,config),/DENIED/);
  assert.throws(()=>verifyProductionD1Information(d1,{d1_databases:[]}),/DENIED/);
});
test("Recovery bookmark and explicit future Environment arming gate required",()=>{
  assert.equal(verifyRecoveryPoint({bookmark:"bookmark-checked-123"}),true);
  assert.equal(verifyRecoveryPoint({success:true,result:{bookmark:"bookmark-checked-123"}}),true);
  assert.throws(()=>verifyRecoveryPoint({success:false,result:{bookmark:"bookmark-checked-123"}}),/DENIED/);
  assert.equal(verifyEnvArmed("armed-for-production-release"),true);
  for(const invalid of [null,{}, {bookmark:""}, {bookmark:2}])
    assert.throws(()=>verifyRecoveryPoint(invalid),/DENIED/);
  for(const invalid of [undefined,"","true","PRODUCTION"])
    assert.throws(()=>verifyEnvArmed(invalid),/DENIED/);
});
test("Release workflow does not use privileged GITHUB_TOKEN, PR merge or UAT deployment",()=>{
  assert.doesNotMatch(release,/permissions:\s*\n\s*contents:\s*write|id-token:\s*write/);
  assert.doesNotMatch(release,/workflow_run:|pull_request:|github\.event_name == 'push'/);
  assert.match(release,/actions: read/);
  assert.doesNotMatch(release,/deployments: (read|write)/);
  assert.match(release,/Verify actual Production D1 UUID/);
  assert.match(release,/Verify actual remote applied ledger and exact approved pending migrations/);
  assert.match(release,/Capture and verify Production D1 recovery bookmark/);
  assert.match(release,/Apply only source-approved pending Production D1 migrations/);
  assert.match(release,/Verify all approved migrations applied and no pending files remain/);
  assert.match(release,/Verify active Production Worker D1 binding/);
  assert.doesNotMatch(ci,/CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN/);
});

const baseline=[
  "0001_initial.sql","0002_auth_foundation.sql",
  "0003_group_player_user_link.sql","0004_system_group_roles.sql",
  "0005_player_invitations.sql","0006_line_login_states.sql",
  "0007_single_active_session.sql","0008_configurable_mahjong_rules.sql",
  "0009_ios_pwa_auth_handoff.sql","0010_game_result_placement.sql",
];
const next=["0011_new_feature.sql","0012_new_feature.sql","0013_new_feature.sql"];
const source=[...baseline,...next];
const ledger=(names)=>({success:true,result:[{success:true,results:names.map(name=>({name}))}]});

test("Real D1 migration ledger: only approved exact pending ordered source suffix is accepted",()=>{
  assert.deepEqual(readRemoteAppliedMigrations(ledger(baseline)),baseline);
  assert.deepEqual(verifyRemoteMigrationPlan(ledger(baseline),source,next.join(","),"before"),next);
  assert.deepEqual(verifyRemoteMigrationPlan(ledger([...baseline,next[0]]),source,next.slice(1).join(","),"before"),next.slice(1));
  assert.deepEqual(verifyRemoteMigrationPlan(ledger(source),source,"none","before"),[]);
  assert.deepEqual(verifyRemoteMigrationPlan(ledger(source),source,"none","after"),[]);
});
test("D1 actual pending mismatches or extra approved migrations fail closed",()=>{
  for(const approved of [
    "none",next[0],next.slice(1).join(","),[...next].reverse().join(","),
    [...next,"0014_unapproved.sql"].join(","),
  ])assert.throws(()=>verifyRemoteMigrationPlan(ledger(baseline),source,approved,"before"),/DENIED/);
  assert.throws(()=>verifyRemoteMigrationPlan(ledger([...baseline,next[0]]),source,next.join(","),"before"),/DENIED/);
  assert.throws(()=>verifyRemoteMigrationPlan(ledger(baseline),source,next.join(","),"after"),/DENIED/);
  assert.throws(()=>verifyRemoteMigrationPlan(ledger([...baseline,next[0]]),source,next.slice(1).join(","),"after"),/DENIED/);
});
test("Unknown, missing, reordered, duplicate or malformed remote migration ledger is rejected",()=>{
  for(const applied of [
    baseline.slice(0,-1),baseline.slice(1),
    [...baseline.slice(0,-1),"0010_wrong.sql"],
    [...baseline,"0013_new_feature.sql"],
    [...baseline,baseline[0]],
    [...baseline,"0011_new_feature.sql","0011_new_feature.sql"],
    [...baseline,"not-sql"],
    [...source,"0014_not_in_source.sql"],
  ])assert.throws(()=>verifyRemoteMigrationPlan(ledger(applied),source,next.join(","),"before"),/DENIED/);
  for(const bad of [
    null,{}, {success:false,result:[{success:true,results:[]}]},
    {success:true,result:[]},{success:true,result:[{success:false,results:[]}]},
    {success:true,result:[{success:true,results:null}]},
    {success:true,result:[{success:true,results:[]},{success:true,results:[]}]},
    {success:true,result:[{success:true,results:[{}]}]},
  ])assert.throws(()=>readRemoteAppliedMigrations(bad),/DENIED/);
});
test("Static release guard requires both actual remote pre/post migration checks",()=>{
  assert.match(release,/remote-migrations before/);
  assert.match(release,/remote-migrations after/);
  assert.throws(()=>assertReleaseTopology(ci,release.replace("remote-migrations before","remote-migrations missing")),/admission/);
  assert.throws(()=>assertReleaseTopology(ci,release.replace("remote-migrations after","remote-migrations missing")),/admission/);
});
test("Cloudflare D1 migration query is read-only, pinned, and cannot run before approval",()=>{
  assert.match(release,/SELECT name FROM d1_migrations ORDER BY id/g);
  assert.match(release,/d1\/database\/95a84e69-692e-45f1-9762-0b71b298199b\/query/g);
  const approval=release.indexOf("environment: production");
  const firstQuery=release.indexOf("SELECT name FROM d1_migrations");
  const firstMutation=release.indexOf("run: npm run db:migrate:prod");
  const postQuery=release.lastIndexOf("SELECT name FROM d1_migrations");
  assert.ok(approval>=0&&firstQuery>approval&&firstMutation>firstQuery&&postQuery>firstMutation);
  assert.doesNotMatch(release,/--request DELETE|--request PUT/);
});

test("Preflight checks migration approval syntax, not stale source baseline",()=>{
  assert.deepEqual(verifyMigrationApprovalSyntax("0012_new_feature.sql,0013_new_feature.sql",source),next.slice(1));
  assert.deepEqual(verifyMigrationApprovalSyntax("none",source),[]);
  for(const bad of [
    "0013_new_feature.sql,0012_new_feature.sql",
    "0012_new_feature.sql,0012_new_feature.sql",
    "0014_unknown.sql","", "0012_new_feature.sql,",
  ])assert.throws(()=>verifyMigrationApprovalSyntax(bad,source),/DENIED/);
});
