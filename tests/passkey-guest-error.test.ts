import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {guestPasskeyFailureMessage as failure} from "../src/components/passkey-guest-error";
const error=(name:string,message="")=>Object.assign(new Error(message),{name});
test("WebAuthn NotAllowed and Abort do not mislabel an interruption as a deliberate cancel",()=>{
  for(const name of ["NotAllowedError","AbortError"]){
    const text=failure("recover","device",error(name));
    assert.match(text,/端末でパスキーの操作を完了できません/);
    assert.match(text,/キャンセル以外にも/);
    assert.doesNotMatch(text,/認証をキャンセルしました/);
  }
});
test("invite, recovery and login errors identify the correct flow and phase",()=>{
  assert.match(failure("recover","options",error("Error","passkey_http_409")),/復旧リンク/);
  assert.match(failure("register","options",error("Error","passkey_http_409")),/招待リンク/);
  assert.match(failure("recover","verify",error("Error","passkey_http_409")),/復旧登録/);
  assert.match(failure("register","verify",error("Error","passkey_http_409")),/招待登録/);
  assert.match(failure("login","verify",error("Error","passkey_http_409")),/ログイン/);
  assert.match(failure("register","device",error("InvalidStateError")),/すでにある可能性/);
  assert.match(failure("recover","options",error("Error","passkey_http_429")),/アクセスが集中/);
});
test("guest component tracks browser versus server failures without exposing raw token",()=>{
  const s=readFileSync("src/components/passkey-guest-access.tsx","utf8");
  for(const stage of ['stage="options"','stage="device"','stage="verify"'])assert.ok(s.includes(stage));
  assert.ok(s.includes("guestPasskeyFailureMessage(mode,stage,error)"));
  for(const route of ["/api/auth/passkey/recovery/verify","/api/auth/passkey/invite/verify","/api/auth/passkey/login/verify"])assert.ok(s.includes(route));
  assert.ok(!s.includes("認証をキャンセルしました。"));
});
