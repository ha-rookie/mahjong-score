import test from "node:test";
import assert from "node:assert/strict";
import {
  beginPasskeyLineStepUp, finishPasskeyLineStepUp, isPasskeyStepUpState,
  readPasskeyStepUpProof, consumePasskeyStepUpProof,
} from "../src/worker/auth/line-stepup";

type Row = {id:string; stateHash:string;nonce:string;userId:string;sessionHash:string;
  createdAt:string;expiresAt:string;claimedAt:string|null;reauthAt:string|null;
  proofHash:string|null;proofConsumedAt:string|null};
class FakeD1 {
  rows:Row[]=[];
  identities=new Map([["line-sub-1","user-1"],["line-sub-2","user-2"]]);
  unavailable=false;
  prepare(sql:string){
    let args:unknown[]=[];
    const rows=this.rows,identities=this.identities,isDown=()=>this.unavailable;
    return {
      bind(...p:unknown[]){args=p;return this;},
      async first<T>():Promise<T|null>{
        if(isDown())throw new Error("D1 unavailable");
        if(sql.startsWith("SELECT 1 AS ok FROM external_identities")) {
          return [...identities.values()].includes(String(args[0])) ? {ok:1} as T:null;
        }
        if(sql.startsWith("SELECT COUNT(*) AS total")) {
          const [user,since]=args;return {total:rows.filter(r=>r.userId===user&&r.createdAt>=String(since)).length} as T;
        }
        if(sql.startsWith("SELECT user_id AS userId FROM external_identities")) {
          const userId=identities.get(String(args[0]));return userId?{userId} as T:null;
        }
        if(sql.startsWith("UPDATE passkey_line_stepups SET claimed_at")) {
          const [at,stateHash,user,sessionHash,now]=args;
          const row=rows.find(r=>r.stateHash===stateHash&&r.userId===user&&r.sessionHash===sessionHash&&
            r.claimedAt===null&&r.expiresAt>String(now));
          if(!row)return null;
          row.claimedAt=String(at);
          return {id:row.id,userId:row.userId,nonce:row.nonce,createdAt:row.createdAt} as T;
        }
        if(sql.startsWith("SELECT user_id AS userId,reauth_at")) {
          const [proofHash,user,sessionHash,since,until]=args;
          const row=rows.find(r=>r.proofHash===proofHash&&r.userId===user&&r.sessionHash===sessionHash&&
            r.proofConsumedAt===null&&r.reauthAt!==null&&r.reauthAt>=String(since)&&r.reauthAt<=String(until)&&r.claimedAt!==null);
          return row?{userId:row.userId,reauthAt:row.reauthAt} as T:null;
        }
        if(sql.startsWith("UPDATE passkey_line_stepups SET proof_consumed_at")) {
          const [at,proofHash,user,sessionHash,since,until]=args;
          const row=rows.find(r=>r.proofHash===proofHash&&r.userId===user&&r.sessionHash===sessionHash&&
            r.proofConsumedAt===null&&r.claimedAt!==null&&r.reauthAt!==null&&
            r.reauthAt>=String(since)&&r.reauthAt<=String(until));
          if(!row)return null;
          row.proofConsumedAt=String(at);
          return {id:row.id} as T;
        }
        throw new Error("Unknown step-up query");
      },
      async run(){
        if(isDown())throw new Error("D1 unavailable");
        if(sql.startsWith("INSERT INTO passkey_line_stepups")) {
          const [id,stateHash,nonce,userId,sessionHash,createdAt,expiresAt]=args;
          rows.push({id:String(id),stateHash:String(stateHash),nonce:String(nonce),userId:String(userId),
            sessionHash:String(sessionHash),createdAt:String(createdAt),expiresAt:String(expiresAt),
            claimedAt:null,reauthAt:null,proofHash:null,proofConsumedAt:null});
          return {meta:{changes:1}};
        }
        if(sql.startsWith("UPDATE passkey_line_stepups SET proof_hash")) {
          const [proofHash,reauthAt,id,user,sessionHash,now]=args;
          const row=rows.find(r=>r.id===id&&r.userId===user&&r.sessionHash===sessionHash&&r.claimedAt!==null&&
            r.proofHash===null&&r.expiresAt>String(now));
          if(!row)return {meta:{changes:0}};
          row.proofHash=String(proofHash);row.reauthAt=String(reauthAt);
          return {meta:{changes:1}};
        }
        throw new Error("Unknown step-up mutation");
      },
    };
  }
}
const current=new Date("2026-10-24T00:00:00.000Z");
const env=(fake:FakeD1)=>({DB:fake as unknown as D1Database,LINE_CHANNEL_ID:"12345678",LINE_CHANNEL_SECRET:"test-only-secret"});
type FakeProviderClaims = {sub?:string;nonce?:string;auth_time?:number;amr?:string[];aud?:string};
const provider=(authNonce:string,changes:FakeProviderClaims={})=>{
  let requests=0;
  const respond:typeof fetch=async (_input,init) => {
    requests++;
    const params=new URLSearchParams(init?.body as string);
    if(requests===1){
      assert.equal(params.get("grant_type"),"authorization_code");
      assert.equal(params.get("redirect_uri"),"https://mahjong-score.ha-rookie.workers.dev/api/auth/line/callback");
      return Response.json({id_token:"redacted-test-id-token"});
    }
    assert.equal(params.get("nonce"),authNonce);
    return Response.json({
      iss:"https://access.line.me",aud:changes.aud??"12345678",sub:changes.sub??"line-sub-1",
      nonce:changes.nonce??authNonce,exp:Math.floor(current.getTime()/1000)+1000,
      iat:Math.floor(current.getTime()/1000),auth_time:changes.auth_time??Math.floor(current.getTime()/1000),
      amr:changes.amr??["pwd"],
    });
  };
  return respond;
};
const begin=async(fake:FakeD1,userId="user-1",cookie="signed.session.cookie",at=current)=>{
  const {authorizationUrl}=await beginPasskeyLineStepUp(env(fake),userId,cookie,at);
  return new URL(authorizationUrl);
};

test("S2-B step-up start is existing-LINE-User only, randomized state, nonce, prompt=login and max_age=0",async()=>{
  const fake=new FakeD1();
  const url=await begin(fake);
  assert.equal(url.origin,"https://access.line.me");
  assert.equal(url.searchParams.get("prompt"),"login");
  assert.equal(url.searchParams.get("max_age"),"0");
  assert.equal(url.searchParams.get("redirect_uri"),"https://mahjong-score.ha-rookie.workers.dev/api/auth/line/callback");
  assert.ok(isPasskeyStepUpState(url.searchParams.get("state")));
  assert.equal(fake.rows.length,1);
  assert.notEqual(fake.rows[0].stateHash,url.searchParams.get("state"));
  assert.notEqual(fake.rows[0].sessionHash,"signed.session.cookie");
  assert.notEqual(fake.rows[0].nonce,"");
  assert.equal(url.searchParams.get("nonce"),fake.rows[0].nonce);
  assert.notEqual((await begin(fake)).searchParams.get("state"),url.searchParams.get("state"));
});

test("S2-B cannot start step-up for a User without existing LINE identity",async()=>{
  const fake=new FakeD1();
  await assert.rejects(begin(fake,"unlinked"),/no linked LINE identity/);
  assert.equal(fake.rows.length,0);
});
test("S2-B rate limits repeated starts without creating more state",async()=>{
  const fake=new FakeD1();
  for(let i=0;i<6;i++)await begin(fake);
  await assert.rejects(begin(fake),/rate limit/);
  assert.equal(fake.rows.length,6);
});
test("S2-B claim verifies same session, nonce, issuer, audience, auth time and immutable linked identity",async()=>{
  const fake=new FakeD1();
  const url=await begin(fake);
  const state=url.searchParams.get("state")!;
  const verified=await finishPasskeyLineStepUp(env(fake),state,"code","user-1","signed.session.cookie",
    current,provider(fake.rows[0].nonce));
  assert.equal(verified.userId,"user-1");
  assert.match(verified.proofToken,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(fake.rows[0].proofHash,verified.proofToken);
  const context=await readPasskeyStepUpProof(env(fake).DB,"user-1","signed.session.cookie",verified.proofToken,current);
  assert.deepEqual(context,{reauthenticatedUserId:"user-1",authenticationTimeSeconds:Math.floor(current.getTime()/1000)});
  const claimed=await Promise.all(Array.from({length:4},()=>consumePasskeyStepUpProof(
    env(fake).DB,"user-1","signed.session.cookie",verified.proofToken,current)));
  assert.equal(claimed.filter(Boolean).length,1);
  assert.equal(await readPasskeyStepUpProof(env(fake).DB,"user-1","signed.session.cookie",verified.proofToken,current),null);
  await assert.rejects(finishPasskeyLineStepUp(env(fake),state,"again","user-1","signed.session.cookie",
    current,provider(fake.rows[0].nonce)),/already claimed/);
});
test("S2-B wrong browser session cannot claim a valid callback",async()=>{
  const fake=new FakeD1(),url=await begin(fake);
  await assert.rejects(finishPasskeyLineStepUp(env(fake),url.searchParams.get("state")!,"code",
    "user-1","stolen-but-wrong.cookie",current,provider(fake.rows[0].nonce)),/invalid or already/);
  assert.equal(fake.rows[0].claimedAt,null);
});
test("S2-B freshly authenticated *different* LINE subject never changes current user",async()=>{
  const fake=new FakeD1(),url=await begin(fake);
  await assert.rejects(finishPasskeyLineStepUp(env(fake),url.searchParams.get("state")!,"code",
    "user-1","signed.session.cookie",current,provider(fake.rows[0].nonce,{sub:"line-sub-2"})),/account mismatch/);
  assert.equal(fake.rows[0].proofHash,null);
});
test("S2-B older authentication, auto login or wrong nonce never supplies proof",async()=>{
  for(const bad of [
    {auth_time:Math.floor(current.getTime()/1000)-301},
    {amr:["lineautologin"]},
    {amr:[]},
    {amr:["unknown"]},
    {nonce:"wrong-nonce"},
    {aud:"another-channel"},
  ]){
    const fake=new FakeD1(),url=await begin(fake);
    await assert.rejects(finishPasskeyLineStepUp(env(fake),url.searchParams.get("state")!,"code",
      "user-1","signed.session.cookie",current,provider(fake.rows[0].nonce,bad)));
    assert.equal(fake.rows[0].proofHash,null);
  }
});
test("S2-B accepted documented interactive amr does not weaken signed same-user verification",async()=>{
  for(const method of ["pwd","lineqr","linesso","mfa"]){
    const fake=new FakeD1(),url=await begin(fake);
    const proof=await finishPasskeyLineStepUp(env(fake),url.searchParams.get("state")!,"code",
      "user-1","signed.session.cookie",current,provider(fake.rows[0].nonce,{amr:[method]}));
    assert.equal(proof.userId,"user-1");
    assert.ok(proof.proofToken);
  }
});

test("S2-B callback expires and proof expires; D1 outage cannot issue new state",async()=>{
  const fake=new FakeD1(),url=await begin(fake);
  const later=new Date(current.getTime()+600_000);
  await assert.rejects(finishPasskeyLineStepUp(env(fake),url.searchParams.get("state")!,"code",
    "user-1","signed.session.cookie",later,provider(fake.rows[0].nonce)),/invalid or already/);
  assert.equal(fake.rows[0].claimedAt,null);
  fake.unavailable=true;
  await assert.rejects(begin(fake),/D1 unavailable/);
});
