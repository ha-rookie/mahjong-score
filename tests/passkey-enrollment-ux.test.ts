import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
test("logged-in passkey enrollment UI does not initiate LINE step-up",()=>{
  const ui=readFileSync("src/components/passkey-enrollment.tsx","utf8");
  assert.ok(ui.includes('post("/api/auth/passkey/register/options",{})'));
  assert.ok(ui.includes('post("/api/auth/passkey/register/verify",{'));
  assert.ok(ui.includes("onClick={()=>void register()}"));
  assert.ok(!ui.includes("passkey/stepup/start"));
  assert.ok(!ui.includes("passkey/stepup/status"));
  assert.ok(!ui.includes("LINEで本人確認"));
  assert.ok(!ui.includes("window.location.assign"));
});
\n
test("account menu shows persisted passkey status and updates after registration",()=>{
  const ui=readFileSync("src/components/passkey-enrollment.tsx","utf8");
  assert.ok(ui.includes('fetch("/api/auth/passkey/register/status"'));
  assert.ok(ui.includes("registeredCount===0?\"未登録\""));
  assert.ok(ui.includes("登録済み（"));
  assert.ok(ui.includes("別のパスキーを追加"));
  assert.ok(ui.includes("await refreshStatus()"));
  assert.ok(ui.includes("登録状況を確認できません"));
  assert.ok(!ui.includes("setRegisteredCount(0)"));
});
