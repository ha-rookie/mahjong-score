// Phase 4 / S0 ONLY: local workerd + Chromium virtual authenticator browser proof.
// This module MUST NOT be deployed to Production or imported by the actual application.
// Fake D1 ID, isolated tables, ephemeral challenge/credential state. No app User/Player.
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

const rpID='localhost';
const expectedOrigin='http://localhost:8799';
const encoder=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const id=()=>crypto.randomUUID();
const fromB64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
const toB64=a=>btoa(String.fromCharCode(...a)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const reply=(o,status=200)=>Response.json(o,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(message,status=400)=>reply({ok:false,error:message},status);

async function schema(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_invites(id TEXT PRIMARY KEY, used_at INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_users(id TEXT PRIMARY KEY)"),
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_challenges(id TEXT PRIMARY KEY, challenge TEXT NOT NULL, kind TEXT NOT NULL, invite_id TEXT, user_id TEXT, expires_at INTEGER NOT NULL, used_at INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_credentials(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, counter INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES s0_browser_users(id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_claims(invite_id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS s0_browser_login_claims(challenge_id TEXT PRIMARY KEY, credential_id TEXT NOT NULL)")
  ]);
  await db.prepare("CREATE TRIGGER IF NOT EXISTS s0_browser_claim_guard BEFORE INSERT ON s0_browser_claims BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM s0_browser_invites i JOIN s0_browser_challenges c ON c.invite_id=i.id WHERE i.id=NEW.invite_id AND c.id=NEW.challenge_id AND c.user_id=NEW.user_id AND c.kind='register' AND i.used_at IS NULL AND c.used_at IS NULL AND c.expires_at>unixepoch('now')) THEN RAISE(ABORT,'invalid_invite_claim') END; END").run();
  await db.prepare("CREATE TRIGGER IF NOT EXISTS s0_browser_login_guard BEFORE INSERT ON s0_browser_login_claims BEGIN SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM s0_browser_challenges c JOIN s0_browser_credentials k ON k.id=NEW.credential_id WHERE c.id=NEW.challenge_id AND c.kind='login' AND c.used_at IS NULL AND c.expires_at>unixepoch('now')) THEN RAISE(ABORT,'invalid_login_claim') END; END").run();
}
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();

async function serveApi(db,path,payload) {
  await schema(db);
  if(path==='/api/fixture') {
    const invite=id();
    await db.prepare("INSERT INTO s0_browser_invites(id) VALUES(?)").bind(invite).run();
    return reply({ok:true,invite});
  }
  if(path==='/api/register/options') {
    const invite=typeof payload.invite==='string'?payload.invite:'';
    const active=await first(db,"SELECT id FROM s0_browser_invites WHERE id=? AND used_at IS NULL",invite);
    if(!active)return error('invite_unavailable',409);
    const userId=id(),requestId=id();
    const options=await generateRegistrationOptions({
      rpName:'S0 Isolated Browser Passkey',
      rpID,
      userName:'test-'+userId.slice(0,8),
      userID:encoder.encode(userId),
      attestationType:'none',
      supportedAlgorithmIDs:[-7],
      authenticatorSelection:{residentKey:'required',userVerification:'required'},
    });
    await db.prepare("INSERT INTO s0_browser_challenges(id,challenge,kind,invite_id,user_id,expires_at) VALUES(?,?,'register',?,?,?)")
      .bind(requestId,options.challenge,invite,userId,now()+300).run();
    return reply({ok:true,options,requestId});
  }
  if(path==='/api/register/verify') {
    const {invite,requestId,credential}=payload;
    const ctx=await first(db,"SELECT challenge,user_id AS userId FROM s0_browser_challenges WHERE id=? AND invite_id=? AND kind='register' AND used_at IS NULL AND expires_at>?",requestId,invite,now());
    if(!ctx)return error('registration_challenge_unavailable',409);
    let result;
    try {
      result=await verifyRegistrationResponse({
        response:credential,expectedChallenge:ctx.challenge,expectedOrigin,expectedRPID:rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7]
      });
    } catch {return error('registration_verification_failed',400);}
    if(!result.verified||!result.registrationInfo?.credential)return error('registration_not_verified',400);
    const verified=result.registrationInfo.credential;
    const instant=now();
    try {
      // The trigger makes expired/consumed/contended invite a SQL failure; D1.batch rolls back all prior INSERTs.
      const ops=[
        db.prepare("INSERT INTO s0_browser_users(id) VALUES(?)").bind(ctx.userId),
        db.prepare("INSERT INTO s0_browser_credentials(id,user_id,public_key,counter) VALUES(?,?,?,?)")
          .bind(verified.id,ctx.userId,toB64(verified.publicKey),verified.counter),
        db.prepare("INSERT INTO s0_browser_claims(invite_id,challenge_id,user_id) VALUES(?,?,?)")
          .bind(invite,requestId,ctx.userId),
        db.prepare("UPDATE s0_browser_invites SET used_at=? WHERE id=? AND used_at IS NULL").bind(instant,invite),
        db.prepare("UPDATE s0_browser_challenges SET used_at=? WHERE id=? AND used_at IS NULL").bind(instant,requestId)
      ];
      const resultBatch=await db.batch(ops);
      if(resultBatch.some(r=>r.meta.changes!==1))throw Error('unexpected_registration_batch_changes');
    } catch {return error('registration_conflict',409);}
    return reply({ok:true,userId:ctx.userId,credentialId:verified.id,sessionIssued:false});
  }
  if(path==='/api/login/options') {
    const requestId=id();
    const options=await generateAuthenticationOptions({rpID,allowCredentials:[],userVerification:'required'});
    await db.prepare("INSERT INTO s0_browser_challenges(id,challenge,kind,expires_at) VALUES(?,?,'login',?)").bind(requestId,options.challenge,now()+300).run();
    return reply({ok:true,options,requestId});
  }
  if(path==='/api/login/verify') {
    const {requestId,credential}=payload;
    const ctx=await first(db,"SELECT challenge FROM s0_browser_challenges WHERE id=? AND kind='login' AND used_at IS NULL AND expires_at>?",requestId,now());
    if(!ctx)return error('login_challenge_unavailable',409);
    const saved=await first(db,"SELECT id,user_id AS userId,public_key AS publicKey,counter FROM s0_browser_credentials WHERE id=?",credential?.id);
    if(!saved)return error('unknown_credential',400);
    let verification;
    try {
      verification=await verifyAuthenticationResponse({
        response:credential,expectedChallenge:ctx.challenge,expectedOrigin,expectedRPID:rpID,
        credential:{id:saved.id,publicKey:fromB64(saved.publicKey),counter:saved.counter},requireUserVerification:true
      });
    } catch {return error('login_verification_failed',400);}
    if(!verification.verified)return error('login_not_verified',400);
    try {
      const results=await db.batch([
        db.prepare("INSERT INTO s0_browser_login_claims(challenge_id,credential_id) VALUES(?,?)").bind(requestId,saved.id),
        db.prepare("UPDATE s0_browser_challenges SET used_at=? WHERE id=? AND used_at IS NULL").bind(now(),requestId),
        db.prepare("UPDATE s0_browser_credentials SET counter=? WHERE id=?").bind(verification.authenticationInfo.newCounter,saved.id)
      ]);
      if(results.some(r=>r.meta.changes!==1))throw Error('unexpected_login_batch_changes');
    } catch {return error('login_conflict',409);}
    return reply({ok:true,userId:saved.userId,sessionIssued:false});
  }
  return error('not_found',404);
}

const html=[
  '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>S0 Passkey Browser Probe</title></head><body>',
  '<main><h1>S0 Passkey Browser Probe — local only</h1><p>Browser-native WebAuthn proof, no application account/session.</p>',
  '<label>Invite <input id="invite" autocomplete="off"></label><button id="register">Register</button><button id="login">Login</button>',
  '<pre id="status">ready</pre></main><script>',
  'const decode=s=>Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(s.length/4)*4,"=")),x=>x.charCodeAt(0));',
  'const encode=a=>btoa(String.fromCharCode(...new Uint8Array(a))).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");',
  'const json=async(path,data)=>{const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data||{})});const x=await r.json();if(!r.ok)throw Error(x.error||"server_rejected");return x;};',
  'const attestationJSON=c=>({id:c.id,rawId:encode(c.rawId),type:c.type,response:{clientDataJSON:encode(c.response.clientDataJSON),attestationObject:encode(c.response.attestationObject),transports:c.response.getTransports?.()||[]},clientExtensionResults:c.getClientExtensionResults()});',
  'const assertionJSON=c=>({id:c.id,rawId:encode(c.rawId),type:c.type,response:{clientDataJSON:encode(c.response.clientDataJSON),authenticatorData:encode(c.response.authenticatorData),signature:encode(c.response.signature),userHandle:c.response.userHandle?encode(c.response.userHandle):null},clientExtensionResults:c.getClientExtensionResults()});',
  'window.s0Browser={',
  ' register:async invite=>{const data=await json("/api/register/options",{invite});const o=data.options;const publicKey={...o,challenge:decode(o.challenge),user:{...o.user,id:decode(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(x=>({...x,id:decode(x.id)}))};const c=await navigator.credentials.create({publicKey});const payload={invite,requestId:data.requestId,credential:attestationJSON(c)};window.lastRegistration=payload;return json("/api/register/verify",payload);},',
  ' login:async()=>{const data=await json("/api/login/options",{});const o=data.options;const publicKey={...o,challenge:decode(o.challenge),allowCredentials:(o.allowCredentials||[]).map(x=>({...x,id:decode(x.id)}))};const c=await navigator.credentials.get({publicKey});const payload={requestId:data.requestId,credential:assertionJSON(c)};window.lastAuthentication=payload;return json("/api/login/verify",payload);},',
  '};',
  'document.querySelector("#register").onclick=async()=>{try{const v=await window.s0Browser.register(document.querySelector("#invite").value);document.querySelector("#status").textContent=JSON.stringify(v);}catch(e){document.querySelector("#status").textContent="Error: "+e.message;}};',
  'document.querySelector("#login").onclick=async()=>{try{const v=await window.s0Browser.login();document.querySelector("#status").textContent=JSON.stringify(v);}catch(e){document.querySelector("#status").textContent="Error: "+e.message;}};',
  '</script></body></html>'
].join('\n');

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/')return new Response(html,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','x-frame-options':'DENY'}});
    if(request.method==='GET'&&url.pathname==='/health')return reply({ready:true});
    if(request.method!=='POST'||!url.pathname.startsWith('/api/'))return error('not_found',404);
    try{return await serveApi(env.DB,url.pathname,await request.json());}
    catch(e){console.error('S0 browser probe error',String(e));return error('probe_internal_error',500);}
  }
};
