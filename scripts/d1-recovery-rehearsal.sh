#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"

PREVIEW_DB_ID="$(node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));process.stdout.write(c.d1_databases[0].preview_database_id||'')")"
PRODUCTION_DB_ID="$(node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));process.stdout.write(c.d1_databases[0].database_id||'')")"

if [[ -z "$PREVIEW_DB_ID" ]]; then
  echo "Preview D1 database id is missing" >&2
  exit 1
fi

if [[ "$PREVIEW_DB_ID" == "$PRODUCTION_DB_ID" ]]; then
  echo "Refusing recovery rehearsal: Preview and Production D1 IDs are identical" >&2
  exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/$PREVIEW_DB_ID/time_travel"
PROBE_TABLE="__recovery_rehearsal_probe"
needs_restore=0
baseline_bookmark=""

restore_preview() {
  local bookmark="$1"
  curl -fsS -X POST "$API_BASE/restore" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$(node -e "process.stdout.write(JSON.stringify({bookmark:process.argv[1]}))" "$bookmark")"
}

cleanup() {
  if [[ "$needs_restore" == "1" && -n "$baseline_bookmark" ]]; then
    echo "Rehearsal interrupted; restoring Preview D1 to baseline bookmark" >&2
    restore_preview "$baseline_bookmark" >/dev/null || true
  fi
}
trap cleanup EXIT

echo "Preparing Preview D1 recovery rehearsal"
npx wrangler d1 execute DB --remote --preview --yes \
  --command "DROP TABLE IF EXISTS $PROBE_TABLE" >/dev/null

bookmark_json="$(curl -fsS "$API_BASE/bookmark" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"
baseline_bookmark="$(BOOKMARK_JSON="$bookmark_json" node -e "const x=JSON.parse(process.env.BOOKMARK_JSON);const b=x?.result?.bookmark;if(!x?.success||!b)process.exit(1);process.stdout.write(b)")"

echo "Baseline bookmark captured"

marker="rehearsal-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
npx wrangler d1 execute DB --remote --preview --yes \
  --command "CREATE TABLE $PROBE_TABLE(marker TEXT NOT NULL); INSERT INTO $PROBE_TABLE(marker) VALUES('$marker')" >/dev/null
needs_restore=1

npx wrangler d1 execute DB --remote --preview --yes --json \
  --command "SELECT marker FROM $PROBE_TABLE LIMIT 1" > /tmp/d1-recovery-before.json

EXPECTED_MARKER="$marker" node <<'NODE'
const fs = require("fs");
const value = JSON.parse(fs.readFileSync("/tmp/d1-recovery-before.json", "utf8"));
const rows = Array.isArray(value) ? value.flatMap((x) => x.results ?? []) : (value.results ?? []);
if (!rows.some((row) => row.marker === process.env.EXPECTED_MARKER)) {
  console.error("Recovery rehearsal probe could not be verified before restore");
  process.exit(1);
}
NODE

echo "Probe verified; restoring Preview D1"
restore_response="$(restore_preview "$baseline_bookmark")"
RESTORE_JSON="$restore_response" node <<'NODE'
const value = JSON.parse(process.env.RESTORE_JSON);
if (!value?.success) {
  console.error("D1 Time Travel restore API returned failure");
  process.exit(1);
}
NODE
needs_restore=0

npx wrangler d1 execute DB --remote --preview --yes --json \
  --command "SELECT COUNT(*) AS probeCount FROM sqlite_master WHERE type='table' AND name='$PROBE_TABLE'" > /tmp/d1-recovery-after.json

node <<'NODE'
const fs = require("fs");
const value = JSON.parse(fs.readFileSync("/tmp/d1-recovery-after.json", "utf8"));
const rows = Array.isArray(value) ? value.flatMap((x) => x.results ?? []) : (value.results ?? []);
const count = Number(rows[0]?.probeCount ?? -1);
if (count !== 0) {
  console.error(`Recovery rehearsal failed: probe table remains (count=${count})`);
  process.exit(1);
}
NODE

echo "D1 Preview recovery rehearsal succeeded"
