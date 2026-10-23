import assert from "node:assert/strict";
import test from "node:test";
import {
  getRegistrationAttestation, webauthnRegistrationSupported,
} from "../src/infrastructure/api/passkey-browser";

const options={challenge:"base64url-challenge",rp:{id:"mahjong-score.ha-rookie.workers.dev",name:"三麻スコア"},user:{id:"user-id",name:"user"}};
const parsed={
  challenge:new Uint8Array([1,2,3]),rp:{id:"mahjong-score.ha-rookie.workers.dev",name:"三麻スコア"},
  user:{id:new Uint8Array([4,5,6]),name:"user",displayName:"user"},
  pubKeyCredParams:[{type:"public-key",alg:-7}],
} as PublicKeyCredentialCreationOptions;

test("S2-B native WebAuthn codec passes decoded options and posts JSON-safe attestation",async()=>{
  const attestation={id:"AQID",rawId:"AQID",type:"public-key",response:{attestationObject:"AgME",clientDataJSON:"BQYH"}};
  let parsedCalled=false,createCalled=false;
  const response=await getRegistrationAttestation(options,
    (input)=>{parsedCalled=input===options;return parsed;},
    async({publicKey})=>{
      assert.equal(publicKey,parsed);
      createCalled=true;
      return {type:"public-key",toJSON:()=>attestation} as unknown as Credential;
    });
  assert.equal(parsedCalled,true);
  assert.equal(createCalled,true);
  assert.deepEqual(response,attestation);
});

test("S2-B native WebAuthn rejects incomplete options, user cancellation and invalid authenticator",async()=>{
  await assert.rejects(getRegistrationAttestation(null,()=>parsed,async()=>null),/missing_options/);
  const invalid={challenge:new Uint8Array([1]),rp:{name:"missing RP ID"},user:{id:new Uint8Array([1]),name:"x"}} as PublicKeyCredentialCreationOptions;
  await assert.rejects(getRegistrationAttestation(options,()=>invalid,async()=>null),/invalid_webauthn_options/);
  await assert.rejects(getRegistrationAttestation(options,()=>parsed,async()=>null),/invalid_webauthn_credential/);
  await assert.rejects(getRegistrationAttestation(options,()=>parsed,async()=>{
    const e=new Error("Cancelled");e.name="NotAllowedError";throw e;
  }),{name:"NotAllowedError"});
});

test("S2-B unsupported non-browser environment cannot expose registration action",()=>{
  assert.equal(webauthnRegistrationSupported(),false);
});
