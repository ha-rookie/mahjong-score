import test from "node:test";
import assert from "node:assert/strict";
import {resolvePasskeyRelyingParty,PRODUCTION_PASSKEY,ANDROID_UAT_PASSKEY} from "../src/worker/auth/passkey-rp";

test("Production passkey defaults stay unchanged",()=>{
  assert.deepEqual(resolvePasskeyRelyingParty({}),PRODUCTION_PASSKEY);
  assert.equal(PRODUCTION_PASSKEY.origin,"https://mahjong-score.ha-rookie.workers.dev");
  assert.equal(PRODUCTION_PASSKEY.rpId,"mahjong-score.ha-rookie.workers.dev");
});
test("Android UAT is a distinct fixed relying party",()=>{
  const rp=resolvePasskeyRelyingParty({PASSKEY_ENV:"android-uat"});
  assert.deepEqual(rp,ANDROID_UAT_PASSKEY);
  assert.notEqual(rp.origin,PRODUCTION_PASSKEY.origin);
  assert.notEqual(rp.rpId,PRODUCTION_PASSKEY.rpId);
  assert.equal(new URL(rp.origin).hostname,rp.rpId);
});
test("Unknown or user-controlled environment names fail closed",()=>{
  for(const value of ["","production","preview","https://evil.example","android-uat,production"]){
    assert.throws(()=>resolvePasskeyRelyingParty({PASSKEY_ENV:value}),/Unsupported/);
  }
});
