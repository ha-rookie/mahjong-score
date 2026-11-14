import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("S2-B: isolated real local D1 step-up constraints, atomic replay gate and existing Score schema", {timeout:120_000},()=>{
  const persist=mkdtempSync(join(tmpdir(),"mahjong-s2b-stepup-"));
  const npx=process.platform==="win32"?"npx.cmd":"npx";
  const run=(args:string[])=>execFileSync(npx,["wrangler",...args],{
    cwd:process.cwd(),encoding:"utf8",timeout:70000,maxBuffer:4*1024*1024,
    stdio:["ignore","pipe","pipe"],
  });
  const query=(sql:string)=>{
    const raw=run(["d1","execute","DB","--local","--persist-to",persist,"--json","--command",sql]);
    const idx=raw.indexOf("[");assert.ok(idx>=0,"D1 JSON missing");
    const data=JSON.parse(raw.slice(idx)) as Array<{success:boolean;results:Array<Record<string,unknown>>}>;
    assert.ok(data.every(row=>row.success));return data.flatMap(row=>row.results);
  };
  try{
    run(["d1","migrations","apply","DB","--local","--persist-to",persist]);
    query("INSERT INTO users(id,display_name,created_at,updated_at) VALUES('user1','Test','2026-10-24','2026-10-24')");
    query("INSERT INTO passkey_line_stepups(id,state_hash,nonce,user_id,session_hash,created_at,expires_at) VALUES('f1','hash1','random-nonce','user1','cookie-digest','2026-10-24T00:00:00Z','2026-10-24T00:10:00Z')");
    assert.deepEqual(query("SELECT COUNT(*) AS n FROM passkey_line_stepups"),[{n:1}]);
    // Wrong browser's signed-cookie digest must not claim the OAuth state.
    assert.equal(query("UPDATE passkey_line_stepups SET claimed_at='2026-10-24T00:01:00Z' WHERE state_hash='hash1' AND user_id='user1' AND session_hash='wrong-cookie' AND claimed_at IS NULL AND expires_at>'2026-10-24T00:01:00Z' RETURNING id").length,0);
    assert.deepEqual(query("UPDATE passkey_line_stepups SET claimed_at='2026-10-24T00:01:00Z' WHERE state_hash='hash1' AND user_id='user1' AND session_hash='cookie-digest' AND claimed_at IS NULL AND expires_at>'2026-10-24T00:01:00Z' RETURNING id"),[{id:"f1"}]);
    assert.equal(query("UPDATE passkey_line_stepups SET claimed_at='2026-10-24T00:02:00Z' WHERE state_hash='hash1' AND user_id='user1' AND session_hash='cookie-digest' AND claimed_at IS NULL RETURNING id").length,0);
    query("UPDATE passkey_line_stepups SET proof_hash='proofhash',reauth_at='2026-10-24T00:01:00Z' WHERE id='f1'");
    assert.deepEqual(query("UPDATE passkey_line_stepups SET proof_consumed_at='2026-10-24T00:03:00Z' WHERE proof_hash='proofhash' AND user_id='user1' AND session_hash='cookie-digest' AND proof_consumed_at IS NULL AND reauth_at>='2026-10-24T00:00:00Z' RETURNING id"),[{id:"f1"}]);
    assert.equal(query("UPDATE passkey_line_stepups SET proof_consumed_at='2026-10-24T00:03:30Z' WHERE proof_hash='proofhash' AND proof_consumed_at IS NULL RETURNING id").length,0);
    assert.throws(()=>query("INSERT INTO passkey_line_stepups(id,state_hash,nonce,user_id,session_hash,created_at,expires_at) VALUES('f2','hash1','n','user1','session','2026-10-24','2026-10-25')"));
    assert.throws(()=>query("INSERT INTO passkey_line_stepups(id,state_hash,nonce,user_id,session_hash,created_at,expires_at) VALUES('f3','hash3','n','notfound','session','2026-10-24','2026-10-25')"));
    assert.equal(query("SELECT COUNT(*) AS n FROM passkey_line_stepups")[0]?.n,1);
    assert.equal(query("SELECT COUNT(*) AS n FROM game_results")[0]?.n,0);
  }finally{rmSync(persist,{recursive:true,force:true});}
});
