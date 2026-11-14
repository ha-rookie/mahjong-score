import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  resolvePasskeyRelyingParty, isPasskeyEnrollmentActive,
  PASSKEY_PRODUCTION_ORIGIN, PASSKEY_PRODUCTION_RP_ID,
  PASSKEY_UAT_ORIGIN, PASSKEY_UAT_RP_ID,
  PASSKEY_PRODUCTION_LINE_CHANNEL_ID,
} from "../src/worker/auth/passkey-rp-config";
import {resolvePasskeyRelyingParty as resolveP0RelyingParty} from "../src/worker/auth/passkey-rp";

const uat={
  PASSKEY_ENV:"android-uat",
  LINE_CHANNEL_ID:"9876543210",
  LINE_CHANNEL_SECRET:"test-only-isolated-line-channel",
};
test("P1 production RP always matches P0 production RP and LINE callback",()=>{
  const p0=resolveP0RelyingParty({});
  const p1=resolvePasskeyRelyingParty({});
  assert.equal(p1.environment,"production");
  assert.equal(p1.origin,p0.origin);
  assert.equal(p1.rpId,p0.rpId);
  assert.equal(p1.origin,PASSKEY_PRODUCTION_ORIGIN);
  assert.equal(p1.rpId,PASSKEY_PRODUCTION_RP_ID);
  assert.equal(p1.callbackUrl,p0.origin+"/api/auth/line/callback");
  assert.equal(isPasskeyEnrollmentActive({}),false);
  assert.equal(isPasskeyEnrollmentActive({PASSKEY_REGISTRATION_ENABLED:"true"}),true);
  assert.equal(isPasskeyEnrollmentActive({PASSKEY_REGISTRATION_ENABLED:"TRUE"}),false);
});
test("P1 Android UAT RP must match P0 Android UAT and distinct LINE channel",()=>{
  const p0=resolveP0RelyingParty(uat),p1=resolvePasskeyRelyingParty(uat);
  assert.equal(p1.environment,"android-uat");
  assert.equal(p1.origin,p0.origin);
  assert.equal(p1.rpId,p0.rpId);
  assert.equal(p1.origin,PASSKEY_UAT_ORIGIN);
  assert.equal(p1.rpId,PASSKEY_UAT_RP_ID);
  assert.equal(p1.callbackUrl,p0.origin+"/api/auth/line/callback");
  assert.equal(isPasskeyEnrollmentActive({...uat,PASSKEY_REGISTRATION_ENABLED:"true"}),true);
  assert.equal(isPasskeyEnrollmentActive(uat),false);
});
test("P1 cannot silently select an RP different from P0",()=>{
  const invalid=[
    {...uat,LINE_CHANNEL_ID:PASSKEY_PRODUCTION_LINE_CHANNEL_ID},
    {...uat,LINE_CHANNEL_ID:""},
    {...uat,LINE_CHANNEL_SECRET:""},
    {...uat,PASSKEY_ENV:"production"},
    {...uat,PASSKEY_ENV:"isolated-preview"},
    {...uat,PASSKEY_AUTH_ENVIRONMENT:"production"},
    {...uat,PASSKEY_AUTH_ENVIRONMENT:"isolated-preview"},
    {...uat,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev"},
    {PASSKEY_AUTH_ENVIRONMENT:"production"},
    {PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev"},
  ];
  for(const env of invalid){
    assert.throws(()=>resolvePasskeyRelyingParty(env));
    assert.equal(isPasskeyEnrollmentActive({...env,PASSKEY_REGISTRATION_ENABLED:"true"}),false);
  }
});


test("deployed Production config enables logged-in LINE User passkey enrollment",()=>{
  const config=JSON.parse(fs.readFileSync(new URL("../wrangler.jsonc",import.meta.url),"utf8")) as {
    vars?:Record<string,string>;
  };
  assert.equal(config.vars?.LINE_CHANNEL_ID,PASSKEY_PRODUCTION_LINE_CHANNEL_ID);
  assert.equal(config.vars?.PASSKEY_REGISTRATION_ENABLED,"true");
  assert.equal(isPasskeyEnrollmentActive(config.vars??{}),true);
  const rp=resolvePasskeyRelyingParty(config.vars??{});
  assert.equal(rp.origin,PASSKEY_PRODUCTION_ORIGIN);
  assert.equal(rp.rpId,PASSKEY_PRODUCTION_RP_ID);
});
