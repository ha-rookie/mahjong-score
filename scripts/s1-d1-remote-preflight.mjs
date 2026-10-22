/**
 * S1 / #343 - READ-ONLY D1 migration inventory collector.
 *
 * Default behavior is print-only. --run invokes ONLY Wrangler's
 * "d1 migrations list" for explicitly checked Production/Preview D1 bindings.
 * Never runs apply, execute, deploy, git push or GitHub workflow_dispatch.
 *
 * Intended for an operator with an existing authenticated Wrangler CLI.
 * Does not read or print Cloudflare API tokens/secrets.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const usage = "Usage: node scripts/s1-d1-remote-preflight.mjs [--run]\n" +
  "Without --run, commands are displayed but nothing remote is queried.\n" +
  "--run requires the reviewed PR #344 branch and runs READ-ONLY D1 migrations list for Production and Preview.\n";
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(usage);
  process.exit(0);
}
if (args.length > 1 || (args.length === 1 && args[0] !== "--run")) {
  process.stderr.write(usage);
  process.exit(2);
}
const runRemote = args[0] === "--run";
const stop = (message) => { throw new Error("STOP: " + message); };
const command = (program, parameters, options = {}) =>
  execFileSync(program, parameters, {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    timeout: 90000, stdio: ["ignore", "pipe", "pipe"], ...options,
  }).trim();

try {
  // Fail closed rather than risk choosing the wrong database.
  const config = JSON.parse(readFileSync(resolve(root, "wrangler.jsonc"), "utf8"));
  const binding = config.d1_databases?.find((db) => db.binding === "DB");
  const preview = config.previews?.d1_databases?.find((db) => db.binding === "DB");
  if (!binding || binding.database_name !== "mahjong-score-prod" ||
      !preview || preview.database_name !== "mahjong-score-preview" ||
      !binding.database_id || !binding.preview_database_id ||
      preview.database_id !== binding.preview_database_id ||
      binding.database_id === preview.database_id) {
    stop("Production/Preview D1 binding mismatch. Do not query an ambiguous target.");
  }
  for (const file of ["migrations/0010_game_result_placement.sql",
                      "migrations/0011_phase4_auth_foundation.sql"]) {
    if (!existsSync(resolve(root, file))) stop("Required migration missing: " + file);
  }

  const head = command("git", ["rev-parse", "HEAD"]);
  const currentBranch = command("git", ["branch", "--show-current"]);
  const dirty = command("git", ["status", "--porcelain", "--untracked-files=no"]);
  console.log("S1 D1 read-only preflight");
  console.log("Checked at:", new Date().toISOString());
  console.log("Git HEAD:", head);
  console.log("Git branch:", currentBranch || "(detached)");
  console.log("Production: mahjong-score-prod (DB)");
  console.log("Preview: mahjong-score-preview (--preview)");
  console.log("Expected Production pending migration: 0011_phase4_auth_foundation.sql only.");
  console.log("Commands:");
  console.log("  npx wrangler d1 migrations list DB --remote");
  console.log("  npx wrangler d1 migrations list DB --remote --preview");
  console.log("These commands are read-only. Apply/execute/deploy are NOT called.");

  if (!runRemote) {
    console.log("DRY RUN ONLY. No Cloudflare connection used; Remote D1 status remains UNVERIFIED.");
  } else {
    if (currentBranch !== "feat/issue-343-s1-auth-foundation") {
      stop("Check out the reviewed S1 PR #344 branch before querying Remote D1.");
    }
    if (dirty) stop("Working tree has tracked modifications; verify PR HEAD first.");
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    const runList = (title, tail) => {
      console.log("\n" + title + " / read-only migration inventory:");
      const stdout = command(npx, ["wrangler", "d1", "migrations", "list", "DB", "--remote", ...tail]);
      console.log(stdout);
      return stdout;
    };

    // No mutation commands can be constructed from caller input.
    const production = runList("PRODUCTION", []);
    const previewOutput = runList("PREVIEW", ["--preview"]);
    const files = [...new Set(production.match(/\b\d{4}_[a-z0-9_]+\.sql\b/g) ?? [])];
    if (files.length !== 1 || files[0] !== "0011_phase4_auth_foundation.sql") {
      stop("Unexpected Production pending list (" + files.join(", ") +
        "). Compare raw Wrangler output and remote migration history. NO-GO.");
    }
    if (!previewOutput) stop("Preview command produced no output. NO-GO.");
    console.log("\nPreflight inventory collected. This is NOT release approval.");
    console.log("Still required: Human review of both outputs, Recovery Point, Cookie vars, CI and main-push deploy gate.");
  }
} catch (error) {
  console.error("S1 preflight unsuccessful. Production remains NO-GO.");
  console.error(error instanceof Error ? error.message : "Unknown failure");
  process.exitCode = 1;
}
