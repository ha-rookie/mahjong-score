import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRecentLineReauthentication,
  beginExistingUserPasskeyRegistration,
  finishExistingUserPasskeyRegistration,
  PASSKEY_PRODUCTION_ORIGIN,
  PASSKEY_PRODUCTION_RP_ID,
  type ExistingUserContext,
} from "../src/worker/auth/passkey-registration";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

const now = new Date("2026-10-24T00:00:00.000Z");
const seconds=Math.floor(now.getTime()/1000);
const withIdentity=(userId="same-user",loginTime=seconds):ExistingUserContext=>({
  sessionUserId:userId,
  lineIdentity:{reauthenticatedUserId:userId,authenticationTimeSeconds:loginTime},
});
type Row={id:string;purpose:string;challengeHash:string;userId:string|null;invitationId:string|null;
  expectedOrigin:string;rpId:string;createdAt:string;expiresAt:string;consumedAt:string|null};
class FakeD1 {
  rows=new Map<string,Row>();
  credentials:Record<string,unknown>[]=[];
  users=new Set(["same-user"]);
  down=false;
  prepare(sql:string){
    let params:unknown[]=[];
    const rows=this.rows;
    const credentials=this.credentials;
    const users=this.users;
    const unavailable=()=>this.down;
    return {
      bind(...p:unknown[]){params=p;return this;},
      async first<T>():Promise<T|null>{
        if(unavailable())throw new Error("D1 down");
        if(sql==="SELECT id FROM users WHERE id=?")return users.has(String(params[0]))?{id:params[0]} as T:null;
        if(sql.startsWith("SELECT challenge_hash")) {
          const [id,purpose,user,invitation,expectedOrigin,rpId,when]=params;
          const row=rows.get(String(id));
          return row && row.purpose===purpose && row.userId===user && row.invitationId===invitation &&
            row.expectedOrigin===expectedOrigin && row.rpId===rpId &&
            row.consumedAt===null && row.expiresAt>String(when)
              ?{challengeHash:row.challengeHash,expectedOrigin:row.expectedOrigin,rpId:row.rpId} as T:null;
        }
        if(sql.startsWith("UPDATE auth_challenges"))throw new Error("Unexpected challenge consume");
        throw new Error("Unexpected query");
      },
      async all<T>():Promise<{results:T[]}>{
        if(unavailable())throw new Error("D1 down");
        if(sql.startsWith("SELECT credential_id"))return{results:credentials.filter(c=>c.userId===params[0]).map(c=>({
          credentialId:c.credentialId,transports:c.transports,
        })) as T[]};
        throw new Error("Unexpected SELECT");
      },
      async run(){
        if(unavailable())throw new Error("D1 down");
        if(sql.startsWith("INSERT INTO auth_challenges")) {
          const [id,challengeHash,purpose,userId,invitationId,expectedOrigin,rpId,createdAt,expiresAt] = params;
          rows.set(String(id),{
            id:String(id),challengeHash:String(challengeHash),purpose:String(purpose),
            userId:userId as string|null,invitationId:invitationId as string|null,
            expectedOrigin:String(expectedOrigin),rpId:String(rpId),
            createdAt:String(createdAt),expiresAt:String(expiresAt),consumedAt:null,
          });
          return {meta:{changes:1}};
        }
        if(sql.startsWith("INSERT INTO passkey_credentials"))throw new Error("Unexpected credential INSERT");
        throw new Error("Unexpected write");
      },
    };
  }
}
const db=(fake:FakeD1)=>fake as unknown as D1Database;

test("S2-B start generates discoverable passkey options and hash-only D1 flow for SAME User",async()=>{
  const fake=new FakeD1();
  const result=await beginExistingUserPasskeyRegistration(db(fake),withIdentity(),now);
  assert.equal(result.options.rp.id,PASSKEY_PRODUCTION_RP_ID);
  assert.equal(result.options.authenticatorSelection?.residentKey,"required");
  assert.equal(result.options.authenticatorSelection?.userVerification,"required");
  assert.equal(result.options.pubKeyCredParams.length,1);
  assert.equal(result.options.pubKeyCredParams[0]?.alg,-7);
  assert.equal(result.options.challenge.length,43);
  assert.equal(fake.rows.size,1);
  const row=fake.rows.get(result.flowId)!;
  assert.equal(row.userId,"same-user");
  assert.equal(row.expectedOrigin,PASSKEY_PRODUCTION_ORIGIN);
  assert.equal(row.rpId,PASSKEY_PRODUCTION_RP_ID);
  assert.equal(row.purpose,"register_user");
  assert.equal(row.challengeHash.length,43);
  assert.notEqual(row.challengeHash,result.options.challenge);
  assert.equal(fake.credentials.length,0);
});

test("S2-B start rejects wrong-user LINE reauth, stale timestamp, future or absent authentication",async()=>{
  const fake=new FakeD1();
  const wrongUser={...withIdentity(),lineIdentity:{reauthenticatedUserId:"victim",authenticationTimeSeconds:seconds}};
  for(const ctx of [
    wrongUser,
    withIdentity("same-user",seconds-301),
    withIdentity("same-user",seconds+31),
    withIdentity("same-user",Number.NaN),
  ]){
    await assert.rejects(beginExistingUserPasskeyRegistration(db(fake),ctx,now));
  }
  assert.equal(fake.rows.size,0);
});

test("S2-B same-user requirement never creates a new User or links Player",async()=>{
  const fake=new FakeD1();
  await assert.rejects(beginExistingUserPasskeyRegistration(db(fake),withIdentity("missing"),now),/User not found/);
  assert.equal(fake.rows.size,0);
  assert.equal(fake.users.size,1);
});

test("S2-B registration options exclude user's existing credentials, not another User's",async()=>{
  const fake=new FakeD1();
  fake.credentials.push(
    {userId:"same-user",credentialId:"AQID",transports:'["internal"]'},
    {userId:"another",credentialId:"BAUG",transports:'["usb"]'},
  );
  const out=await beginExistingUserPasskeyRegistration(db(fake),withIdentity(),now);
  assert.equal(out.options.excludeCredentials?.length,1);
  assert.equal(out.options.excludeCredentials?.[0]?.id,"AQID");
});

test("S2-B invalid response cannot claim challenge or create credential",async()=>{
  const fake=new FakeD1();
  const out=await beginExistingUserPasskeyRegistration(db(fake),withIdentity(),now);
  const fabricated={
    id:"AQID",rawId:"AQID",type:"public-key",
    response:{clientDataJSON:"AQID",attestationObject:"AQID"},
    clientExtensionResults:{},
  } as unknown as RegistrationResponseJSON;
  await assert.rejects(finishExistingUserPasskeyRegistration(db(fake),withIdentity(),out.flowId,fabricated,now));
  assert.equal(fake.rows.get(out.flowId)?.consumedAt,null);
  assert.equal(fake.credentials.length,0);
});

test("S2-B no registration if D1 fails (fail closed)",async()=>{
  const fake=new FakeD1();fake.down=true;
  await assert.rejects(beginExistingUserPasskeyRegistration(db(fake),withIdentity(),now),/D1 down/);
  assert.equal(fake.rows.size,0);
});

test("S2-B fresh identity can be checked without creating a challenge",()=>{
  assert.doesNotThrow(()=>assertRecentLineReauthentication(withIdentity(),seconds));
  assert.throws(()=>assertRecentLineReauthentication({
    sessionUserId:"same-user",lineIdentity:{reauthenticatedUserId:"same-user",authenticationTimeSeconds:seconds-302}
  },seconds),/Recent explicit/);
});

test("S2-B Preview registration keeps challenge stored under Preview RP and never Production RP",async()=>{
  const fake=new FakeD1();
  const previewConfig={
    PASSKEY_AUTH_ENVIRONMENT:"isolated-preview",
    PASSKEY_PREVIEW_ORIGIN:"https://s2b-preview.ha-rookie.workers.dev",
    LINE_CHANNEL_ID:"9876543210",
    LINE_CHANNEL_SECRET:"test-preview-secret",
  };
  const output=await beginExistingUserPasskeyRegistration(db(fake),withIdentity(),now,previewConfig);
  const row=fake.rows.get(output.flowId);
  assert.equal(output.options.rp.id,"s2b-preview.ha-rookie.workers.dev");
  assert.equal(row?.expectedOrigin,"https://s2b-preview.ha-rookie.workers.dev");
  assert.equal(row?.rpId,"s2b-preview.ha-rookie.workers.dev");
  assert.notEqual(row?.rpId,PASSKEY_PRODUCTION_RP_ID);
  assert.equal(fake.credentials.length,0);
});
