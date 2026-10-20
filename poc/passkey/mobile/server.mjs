// S0 ONLY - ephemeral, untrusted-traffic limited, independently hosted WebAuthn verifier.
// The module Map is a deliberate non-production test limitation: Cloudflare can rotate isolates.
// This does not log anyone in, persist identities, issue sessions, or access app data.
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {serverProbeScript} from './server-client.mjs';
const REMOTE_HOST='s0-phone-check-337-mahjong-score-passkey-s0-phone-337.ha-rookie.workers.dev';
const MAX_FLOWS=24,FLOW_TTL=600000,CHALLENGE_TTL=120000;
const flows=new Map();
const headers={
 'cache-control':'no-store, max-age=0',
 'content-security-policy':"default-src 'none';script-src 'self';style-src 'unsafe-inline';connect-src 'self';object-src 'none';frame-ancestors 'none';form-action 'none';base-uri 'none'",
 'x-content-type-options':'nosniff','x-frame-options':'DENY','x-robots-tag':'noindex, nofollow, noarchive',
 'referrer-policy':'no-referrer',
 'permissions-policy':'camera=(),microphone=(),geolocation=(),publickey-credentials-create=(self),publickey-credentials-get=(self)'
};
const ok=(o,status=200)=>Response.json(o,{status,headers});
const deny=(reason,status=409)=>ok({ok:false,reason,serverVerified:false},status);
const time=()=>Date.now();
const valid=(u)=>u.hostname==='localhost'&&u.protocol==='http:' || u.hostname===REMOTE_HOST&&u.protocol==='https:';
const flowFor=id=>{
 if(typeof id!=='string'||id.length>100)return null;
 const f=flows.get(id);
 if(f&&time()-f.created<FLOW_TTL)return f;
 if(f)flows.delete(id);
 return null;
};
const SERVER_HTML="<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>三麻スコア S0 サーバー署名検証</title><style>:root{color-scheme:light dark;font-family:system-ui;line-height:1.65}body{max-width:42rem;margin:auto;padding:1rem}section{padding:1rem;border:1px solid #8886;border-radius:.7rem;margin:1rem 0}button{padding:.8rem;margin:.3rem;border-radius:.5rem;font:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main><h1>S0 サーバー署名検証テスト</h1><p>三麻スコア本体のログインではありません。既存のパスキーは残し、別のテスト用パスキーを作成して検証します。</p><section><button id=\"register\">1. 検証用パスキーを新規作成・サーバー検証</button><button id=\"auth\">2. パスキーを使用・サーバーで署名検証</button><pre id=\"status\" aria-live=\"polite\">準備完了</pre></section><p>サーバーの状態は一時メモリのみ。環境が切り替わると失われ、その場合は失敗します。何度も登録を繰り返さないでください。User・Player・成績・D1・セッションは扱いません。テスト後、OSのパスキー管理からテスト用パスキーを削除してください。</p><a href=\"/\">以前のブラウザ互換性テスト</a></main><script src=\"/server-check.js\" defer></script></body></html>";
export async function handleS0ServerProbe(req,u){
 const path=u.pathname;
 if(path==='/server-check'&&req.method==='GET')return new Response(SERVER_HTML,{headers:{...headers,'content-type':'text/html; charset=utf-8'}});
 if(path==='/server-check.js'&&req.method==='GET')return new Response(serverProbeScript,{headers:{...headers,'content-type':'application/javascript; charset=utf-8'}});
 if(!path.startsWith('/s0-server/'))return null;
 if(req.method!=='POST')return deny('method_not_allowed',405);
 if(!valid(u))return deny('unexpected_origin',403);
 if((req.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')return deny('invalid_content_type',415);
 if(Number(req.headers.get('content-length')||0)>24000)return deny('payload_too_large',413);
 let input;
 try{input=await req.json();if(!input||typeof input!=='object')return deny('invalid_json',400);}catch{return deny('invalid_json',400);}
 for(const [key,f]of flows)if(time()-f.created>FLOW_TTL)flows.delete(key);
 try {
  if(path==='/s0-server/register/options'){
   if(flows.size>=MAX_FLOWS)return deny('test_capacity_reached',429);
   const id=crypto.randomUUID();
   const options=await generateRegistrationOptions({
    rpName:'三麻スコア S0署名検証専用',rpID:u.hostname,
    userID:new TextEncoder().encode(id),userName:'s0-'+id.slice(0,8),
    attestationType:'none',supportedAlgorithmIDs:[-7],
    authenticatorSelection:{residentKey:'required',userVerification:'required'}
   });
   flows.set(id,{created:time(),registerChallenge:options.challenge,registerIssued:time(),credential:null,authChallenge:null});
   return ok({ok:true,flowId:id,options,ephemeral:true});
  }
  if(path==='/s0-server/register/verify'){
   const f=flowFor(input.flowId);
   if(!f)return deny('ephemeral_state_missing');
   if(!f.registerChallenge||time()-f.registerIssued>CHALLENGE_TTL)return deny('registration_challenge_expired');
   const challenge=f.registerChallenge;f.registerChallenge=null;
   let check;
   try{check=await verifyRegistrationResponse({
    response:input.credential,expectedChallenge:challenge,expectedOrigin:u.origin,expectedRPID:u.hostname,
    requireUserVerification:true,supportedAlgorithmIDs:[-7]
   });}catch{return deny('registration_verification_rejected',400);}
   if(!check.verified||!check.registrationInfo?.credential)return deny('registration_not_verified',400);
   f.credential=check.registrationInfo.credential;
   return ok({ok:true,serverVerified:true,registrationVerified:true,sessionIssued:false,ephemeral:true});
  }
  if(path==='/s0-server/auth/options'){
   const f=flowFor(input.flowId);
   if(!f||!f.credential)return deny('ephemeral_state_missing');
   const options=await generateAuthenticationOptions({
    rpID:u.hostname,userVerification:'required',
    allowCredentials:[{type:'public-key',id:f.credential.id,transports:f.credential.transports}]
   });
   f.authChallenge=options.challenge;f.authIssued=time();
   return ok({ok:true,options,ephemeral:true});
  }
  if(path==='/s0-server/auth/verify'){
   const f=flowFor(input.flowId);
   if(!f||!f.credential)return deny('ephemeral_state_missing');
   if(!f.authChallenge||time()-f.authIssued>CHALLENGE_TTL)return deny('authentication_challenge_expired');
   const challenge=f.authChallenge;f.authChallenge=null;
   let check;
   try{check=await verifyAuthenticationResponse({
    response:input.credential,expectedChallenge:challenge,expectedOrigin:u.origin,expectedRPID:u.hostname,
    requireUserVerification:true,
    credential:{id:f.credential.id,publicKey:f.credential.publicKey,counter:f.credential.counter}
   });}catch{return deny('authentication_signature_rejected',400);}
   if(!check.verified)return deny('authentication_signature_invalid',400);
   f.credential.counter=check.authenticationInfo.newCounter;
   return ok({ok:true,serverVerified:true,signatureVerified:true,
    userVerified:check.authenticationInfo.userVerified===true,
    rpIdMatched:check.authenticationInfo.rpID===u.hostname,
    sessionIssued:false,ephemeral:true});
  }
  return deny('not_found',404);
 }catch(e){console.error('S0 WebAuthn probe failed',e instanceof Error?e.name:'Error');return deny('isolated_probe_internal_error',500);}
}
