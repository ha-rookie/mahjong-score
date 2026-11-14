import fs from "node:fs";
import path from "node:path";
import {readRemoteAppliedMigrations,verifyRemoteMigrationPlan} from "./production-release-gate.mjs";

const fail=(message)=>{throw new Error("Production auto-release stopped: "+message);};
const [phase,responsePath,statePath]=process.argv.slice(2);
if(!["before","after"].includes(phase)||!responsePath||!statePath)fail("invalid invocation");
const source=fs.readdirSync(path.join(process.cwd(),"migrations")).filter(x=>x.endsWith(".sql")).sort();
const response=JSON.parse(fs.readFileSync(responsePath,"utf8"));
if(phase==="before"){
  const applied=readRemoteAppliedMigrations(response);
  if(applied.length>source.length)fail("remote history longer than source");
  const pending=source.slice(applied.length);
  const approved=pending.length?pending.join(","):"none";
  const accepted=verifyRemoteMigrationPlan(response,source,approved,"before");
  if(accepted.length!==pending.length||accepted.some((x,i)=>x!==pending[i]))fail("unapproved pending migration");
  fs.writeFileSync(statePath,JSON.stringify({source,applied,pending},null,2)+"\n");
  console.log("Verified Production D1 applied prefix; pending migration count: "+pending.length);
  for(const name of pending)console.log("Pending: "+name);
}else{
  const state=JSON.parse(fs.readFileSync(statePath,"utf8"));
  if(!Array.isArray(state.source)||!Array.isArray(state.applied)||!Array.isArray(state.pending)||
     JSON.stringify(state.source)!==JSON.stringify(source))fail("migration plan changed during release");
  if(state.pending.length+state.applied.length!==source.length||
     JSON.stringify([...state.applied,...state.pending])!==JSON.stringify(source))
    fail("saved migration plan invalid");
  verifyRemoteMigrationPlan(response,source,state.pending.length?state.pending.join(","):"none","after");
  const applied=readRemoteAppliedMigrations(response);
  if(JSON.stringify(applied)!==JSON.stringify(source))fail("Production D1 did not apply all expected migrations");
  console.log("Verified Production D1 migration ledger: all "+source.length+" migrations applied");
}
