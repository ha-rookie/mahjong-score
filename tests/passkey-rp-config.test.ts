import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePasskeyRelyingParty,
  isPasskeyEnrollmentActive,
  PASSKEY_PRODUCTION_ORIGIN,
  PASSKEY_PRODUCTION_RP_ID,
  PASSKEY_PRODUCTION_LINE_CHANNEL_ID,
} from "../src/worker/auth/passkey-rp-config";

const staging={
  PASSKEY_AUTH_ENVIRONMENT:"isolated-preview",
  PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev",
  LINE_CHANNEL_ID:"9876543210",
  LINE_CHANNEL_SECRET:"test-only-staging-secret",
};

test("S2-B production relying party never depends on browser Host or staging guesses",()=>{
  const prod=resolvePasskeyRelyingParty({});
  assert.deepEqual(prod,{
    environment:"production",
    origin:PASSKEY_PRODUCTION_ORIGIN,
    rpId:PASSKEY_PRODUCTION_RP_ID,
    callbackUrl:PASSKEY_PRODUCTION_ORIGIN+"/api/auth/line/callback",
  });
  assert.equal(isPasskeyEnrollmentActive({PASSKEY_REGISTRATION_ENABLED:"true"}),false);
  assert.equal(isPasskeyEnrollmentActive({
    PASSKEY_AUTH_ENVIRONMENT:"production",PASSKEY_REGISTRATION_ENABLED:"true",
  }),true);
  assert.equal(isPasskeyEnrollmentActive({
    PASSKEY_AUTH_ENVIRONMENT:"production",PASSKEY_REGISTRATION_ENABLED:"false",
  }),false);
});

test("S2-B isolated Preview gets exact server-owned HTTPS Origin, RP ID and LINE callback",()=>{
  const rp=resolvePasskeyRelyingParty(staging);
  assert.deepEqual(rp,{
    environment:"isolated-preview",
    origin:"https://s2b-preview.ha-rookie.workers.dev",
    rpId:"s2b-preview.ha-rookie.workers.dev",
    callbackUrl:"https://s2b-preview.ha-rookie.workers.dev/api/auth/line/callback",
  });
  assert.equal(isPasskeyEnrollmentActive({...staging,PASSKEY_REGISTRATION_ENABLED:"true"}),true);
  assert.equal(isPasskeyEnrollmentActive(staging),false);
});

test("S2-B Preview rejects Production host, Production LINE channel, arbitrary Host and insecure URL",()=>{
  const bad=[
    {...staging,PASSKEY_PREVIEW_ORIGIN:PASSKEY_PRODUCTION_ORIGIN},
    {...staging,LINE_CHANNEL_ID:PASSKEY_PRODUCTION_LINE_CHANNEL_ID},
    {...staging,LINE_CHANNEL_ID:""},
    {...staging,LINE_CHANNEL_SECRET:""},
    {...staging,PASSKEY_PREVIEW_ORIGIN:""},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"http://s2b-preview.ha-rookie.workers.dev"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.evil.example"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev.evil.example"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev:8443"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev/extra"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://user:password@s2b-preview.ha-rookie.workers.dev"},
    {...staging,PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev/?x=y"},
    {...staging,PASSKEY_AUTH_ENVIRONMENT:"unknown"},
  ];
  for(const config of bad){
    assert.throws(()=>resolvePasskeyRelyingParty(config));
    assert.equal(isPasskeyEnrollmentActive({...config,PASSKEY_REGISTRATION_ENABLED:"true"}),false);
  }
});

test("S2-B cannot enable from flag alone or silent Preview env omission",()=>{
  const variants=[
    {PASSKEY_REGISTRATION_ENABLED:"true"},
    {PASSKEY_REGISTRATION_ENABLED:"true",PASSKEY_AUTH_ENVIRONMENT:"preview"},
    {...staging,PASSKEY_REGISTRATION_ENABLED:"TRUE"},
    {...staging,PASSKEY_REGISTRATION_ENABLED:"true",PASSKEY_AUTH_ENVIRONMENT:""},
    {...staging,PASSKEY_REGISTRATION_ENABLED:"true",PASSKEY_PREVIEW_ORIGIN:undefined},
  ];
  for(const env of variants) assert.equal(isPasskeyEnrollmentActive(env),false);
});
