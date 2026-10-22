import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// These tests NEVER pass --run: no Cloudflare account or remote D1 access is used.
const preflight="scripts/s1-d1-remote-preflight.mjs";
const call=(arg:string[]=[])=>spawnSync(process.execPath,[preflight,...arg],{
  cwd:process.cwd(),
  encoding:"utf8",
  timeout:15_000,
});

test("S1 remote preflight is dry-run-only by default and prints the reviewed targets",()=>{
  const result=call();
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/DRY RUN ONLY/);
  assert.match(result.stdout,/mahjong-score-prod/);
  assert.match(result.stdout,/mahjong-score-preview/);
  assert.match(result.stdout,/migrations list DB --remote/);
  assert.match(result.stdout,/0011_phase4_auth_foundation\.sql/);
  assert.match(result.stdout,/Remote D1 status remains UNVERIFIED/);
  assert.doesNotMatch(result.stdout,/migration applied|migration completed|migration succeeded/i);
});

test("S1 remote preflight help is local and never invokes a Cloudflare query",()=>{
  const result=call(["--help"]);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/READ-ONLY D1 migrations list/);
  assert.match(result.stdout,/--run/);
  assert.doesNotMatch(result.stdout,/Preflight inventory collected/);
});

test("S1 remote preflight rejects unknown operation flags safely",()=>{
  const result=call(["--deploy"]);
  assert.equal(result.status,2);
  assert.match(result.stderr,/Usage:/);
  assert.doesNotMatch(result.stdout,/Preflight inventory collected/);
});
