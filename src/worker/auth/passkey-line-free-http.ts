/** Four LINE-independent public WebAuthn endpoints, no new authentication system. */
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from "@simplewebauthn/server";
import {
  beginInvitePasskey,finishInvitePasskey,beginPasskeyLogin,finishPasskeyLogin,
} from "./passkey-line-free";
import {resolvePasskeyRelyingParty,type PasskeyRelyingParty} from "./passkey-rp";
import {issuePasskeySessionCookie} from "./line-login";
import {beginExistingUserRecovery,finishExistingUserRecovery} from "./passkey-recovery";

type Env={DB:D1Database;AUTH_SESSION_SECRET?:string;PASSKEY_ENV?:string};
const routes=new Set([
  "/api/auth/passkey/invite/options",
  "/api/auth/passkey/invite/verify",
  "/api/auth/passkey/login/options",
  "/api/auth/passkey/login/verify",
  "/api/auth/passkey/recovery/options",
  "/api/auth/passkey/recovery/verify",
]);
const json=(value:unknown,status=200,session?:string)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
    ...(session?{"set-cookie":session}:{})},
});
const fail=(code:string,status=400)=>json({error:{code}},status);
const asObject=(v:unknown):v is Record<string,unknown>=>v!==null&&
  typeof v==="object"&&!Array.isArray(v);
const parse=async(request:Request)=>{
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json"||
     Number(request.headers.get("content-length")??0)>24000)
    throw new Error("Invalid request format");
  const raw=await request.text();
  if(raw.length>24000)throw new Error("Request size exceeded");
  const result=JSON.parse(raw) as unknown;
  if(!asObject(result))throw new Error("Invalid body");
  return result;
};
export const handleLineFreePasskey=async(request:Request,env:Env):Promise<Response|null>=>{
  const url=new URL(request.url);
  if(!routes.has(url.pathname))return null;
  if(request.method!=="POST")return fail("method_not_allowed",405);
  // Strict server-side RP selection, never from the incoming request.
  let rp:PasskeyRelyingParty;
  try{rp=resolvePasskeyRelyingParty(env);}catch{return fail("auth_unavailable",503);}
  if(url.origin!==rp.origin||request.headers.get("origin")!==rp.origin||
     request.headers.get("sec-fetch-site")==="cross-site")return fail("origin_denied",403);
  if(!env.AUTH_SESSION_SECRET)return fail("auth_unavailable",503);
  let b:Record<string,unknown>;
  try{b=await parse(request);}catch{return fail("invalid_body",400);}
  try{
    switch(url.pathname){
      case "/api/auth/passkey/invite/options":{
        if(typeof b.token!=="string")return fail("invalid_invite",400);
        return json(await beginInvitePasskey(env.DB,b.token,undefined,rp));
      }
      case "/api/auth/passkey/invite/verify":{
        if(typeof b.token!=="string"||typeof b.flowId!=="string"||!asObject(b.credential))
          return fail("invalid_registration",400);
        const result=await finishInvitePasskey(env.DB,b.token,b.flowId,
          b.credential as unknown as RegistrationResponseJSON,undefined,rp);
        return json({registered:true,playerId:result.playerId,groupId:result.groupId},201,
          await issuePasskeySessionCookie(env.DB,env.AUTH_SESSION_SECRET,result.userId));
      }
      case "/api/auth/passkey/recovery/options":{
        if(typeof b.token!=="string")return fail("invalid_recovery",400);
        return json(await beginExistingUserRecovery(env.DB,b.token,undefined,rp));
      }
      case "/api/auth/passkey/recovery/verify":{
        if(typeof b.token!=="string"||typeof b.flowId!=="string"||!asObject(b.credential))
          return fail("invalid_recovery",400);
        const saved=await finishExistingUserRecovery(env.DB,b.token,b.flowId,
          b.credential as unknown as RegistrationResponseJSON,undefined,rp);
        return json({registered:true,playerId:saved.playerId,groupId:saved.groupId},201,
          await issuePasskeySessionCookie(env.DB,env.AUTH_SESSION_SECRET,saved.userId));
      }
      case "/api/auth/passkey/login/options":
        return json(await beginPasskeyLogin(env.DB,undefined,rp));
      case "/api/auth/passkey/login/verify":{
        if(typeof b.flowId!=="string"||!asObject(b.credential))
          return fail("invalid_authentication",400);
        const result=await finishPasskeyLogin(env.DB,b.flowId,
          b.credential as unknown as AuthenticationResponseJSON,undefined,rp);
        return json({authenticated:true},200,
          await issuePasskeySessionCookie(env.DB,env.AUTH_SESSION_SECRET,result.userId));
      }
    }
  }catch{
    // A wrong invite, non-matching credential or replay must not expose SQL,
    // user's identity, stored public key or registration challenge.
    return fail("passkey_not_completed",409);
  }
  return fail("not_found",404);
};
