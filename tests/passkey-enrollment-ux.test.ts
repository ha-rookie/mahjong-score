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
