/** CI-time fail-closed check: a later stacked PR must not bring back
 * automatic Cloudflare D1 migrations or Worker deployments on main push.
 * This is included by the existing migration guard (so #358 cannot bypass
 * it merely by restoring its old workflow body).
 */
import fs from "node:fs";
import path from "node:path";
export function assertReleaseTopology(ci, release) {
  const fail = (reason) => { throw new Error("Production release topology: " + reason); };
  if(!ci.includes("pull_request:") || !ci.includes("push:") ||
     !ci.includes("branches:") || !ci.includes("- main"))
    fail("CI must validate PRs and main updates");
  if(/(^|\n)\s{2}workflow_dispatch\s*:/.test(ci))fail("CI may not be manually used to deploy");
  if(/secrets\.CLOUDFLARE_|db:migrate:prod|wrangler\s+deploy|d1\s+time-travel|d1\s+migrations\s+apply\s+DB\s+--remote/i.test(ci))
    fail("CI must not hold Cloudflare credentials or remote operations");
  if(!ci.includes("run: npm run db:migrations:guard"))fail("Required migration guard missing");
  if(!ci.includes("node --test scripts/test-production-release-gate.mjs"))
    fail("Release negative-case CI tests missing");
  if(!release.includes("workflow_dispatch:")||
     /(^|\n)\s{2}(push|pull_request|workflow_run|schedule|repository_dispatch):/.test(release))
    fail("Release trigger must be workflow_dispatch only");
  if(!release.includes("environment: production")||
     !release.includes("group: mahjong-score-production-release")||
     !release.includes("cancel-in-progress: false")||
     !release.includes("permissions:")||
     !release.includes("contents: read")||
     !release.includes("actions: read")||
     !release.includes("deployments: read"))
    fail("Release environment/concurrency/permissions missing");
  if(!release.includes("scripts/production-release-gate.mjs environment")||
     !release.includes("scripts/production-release-gate.mjs context")||
     !release.includes("scripts/production-release-gate.mjs duplicate"))
    fail("Mandatory release admission checks missing");
}
export function checkReleaseTopologyOnDisk(root=process.cwd()) {
  const ci=fs.readFileSync(path.join(root,".github/workflows/deploy-production.yml"),"utf8");
  const release=fs.readFileSync(path.join(root,".github/workflows/release-production.yml"),"utf8");
  assertReleaseTopology(ci,release);
}
