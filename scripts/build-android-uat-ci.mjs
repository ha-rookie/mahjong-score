/** Build only: selects UAT config for Vite, never runs remote Wrangler commands. */
import {spawnSync} from "node:child_process";
import path from "node:path";
const runner=process.platform==="win32"?"npm.cmd":"npm";
const result=spawnSync(runner,["run","build"],{
  stdio:"inherit",
  env:{...process.env,
    CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH:path.resolve("wrangler.android-uat.jsonc")},
});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
const gate=spawnSync(process.execPath,["scripts/check-uat-artifact.mjs","ci"],{
  stdio:"inherit",
});
if(gate.error)throw gate.error;
process.exit(gate.status??1);
