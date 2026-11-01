import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const bin = process.platform === "win32" ? "npx.cmd" : "npx";

test("S2-A: isolated real Wrangler local D1 accepts atomic UPDATE RETURNING and blocks replay", { timeout: 120_000 }, () => {
  // Isolated LOCAL D1 only. Never --remote, --preview, deploy or production.
  const persist = mkdtempSync(join(tmpdir(), "mahjong-s2-challenge-"));
  const run = (args: string[]) => execFileSync(bin, ["wrangler", ...args], {
    cwd: process.cwd(), encoding: "utf8", timeout: 70_000,
    maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  const query = (sql: string): Record<string, unknown>[] => {
    const raw = run(["d1", "execute", "DB", "--local", "--persist-to", persist, "--json", "--command", sql]);
    const i = raw.indexOf("[");
    assert.ok(i >= 0, "Wrangler should return JSON");
    const data = JSON.parse(raw.slice(i)) as Array<{ success: boolean; results: Record<string, unknown>[] }>;
    assert.ok(data.every(row => row.success), "Local D1 statement succeeded");
    return data.flatMap(row => row.results);
  };
  try {
    run(["d1", "migrations", "apply", "DB", "--local", "--persist-to", persist]);
    query(`INSERT INTO auth_challenges (id, challenge_hash, purpose, expected_origin, rp_id, created_at, expires_at)
      VALUES ('s2-atomic', 'digest-only', 'login', 'https://mahjong-score.ha-rookie.workers.dev',
        'mahjong-score.ha-rookie.workers.dev', '2026-10-23T12:00:00.000Z','2026-10-23T12:02:00.000Z')`);
    const claim=(hash:string,when:string) => query(`UPDATE auth_challenges SET consumed_at='${when}'
      WHERE id='s2-atomic' AND challenge_hash='${hash}' AND purpose='login'
        AND user_id IS NULL AND invitation_id IS NULL
        AND expected_origin='https://mahjong-score.ha-rookie.workers.dev'
        AND rp_id='mahjong-score.ha-rookie.workers.dev'
        AND consumed_at IS NULL AND expires_at>'${when}' RETURNING id`);
    assert.equal(claim("wrong-digest","2026-10-23T12:01:00.000Z").length,0);
    assert.equal(claim("digest-only","2026-10-23T12:02:00.000Z").length,0);
    assert.deepEqual(claim("digest-only","2026-10-23T12:01:00.000Z"),[{ id:"s2-atomic" }]);
    assert.equal(claim("digest-only","2026-10-23T12:01:01.000Z").length,0);
    const rows=query("SELECT consumed_at AS consumedAt FROM auth_challenges WHERE id='s2-atomic'");
    assert.equal(rows.length,1);
    assert.equal(rows[0].consumedAt,"2026-10-23T12:01:00.000Z");
  } finally {
    rmSync(persist,{recursive:true,force:true});
  }
});
