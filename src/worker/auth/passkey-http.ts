/**
 * S2-B (#345): feature-flagged PASSKEY enrollment endpoints.
 * The flag is OFF by default; there are no production/Preview config changes.
 * No user/account creation, Score modification, or passkey login in this file.
 *
 * Start is same-origin POST. The LINE callback is the existing registered
 * OAuth callback URL, dispatched only if state has an S2-B prefix.
 */
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { authenticatedUserId, authStoreUnavailableResponse } from "./line-login";
import {
  PASSKEY_LINE_STEPUP_ORIGIN, beginPasskeyLineStepUp, consumePasskeyStepUpProof,
  finishPasskeyLineStepUp, isPasskeyStepUpState, readPasskeyStepUpProof,
} from "./line-stepup";
import {
  beginExistingUserPasskeyRegistration,
  finishExistingUserPasskeyRegistration,
} from "./passkey-registration";
import { requestCorrelationId, writeAuditLog } from "../audit";

export interface PasskeyHttpEnv {
  DB:D1Database;
  LINE_CHANNEL_ID?:string;
  LINE_CHANNEL_SECRET?:string;
  AUTH_SESSION_SECRET?:string;
  PASSKEY_REGISTRATION_ENABLED?:string;
}
const paths=new Set([
  "/api/auth/passkey/stepup/start",
  "/api/auth/passkey/stepup/status",
  "/api/auth/passkey/register/options",
  "/api/auth/passkey/register/verify",
]);
const noStore={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const reply=(data:unknown,status:number)=>new Response(JSON.stringify(data),{status,headers:noStore});
const error=(code:string,status:number)=>reply({error:{code}},status);
const clearProof="mahjong_passkey_stepup=; Path=/api/auth/passkey; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
const secureProof=(value:string)=>
  `mahjong_passkey_stepup=${value}; Path=/api/auth/passkey; HttpOnly; Secure; SameSite=Strict; Max-Age=300`;
const cookieValue=(request:Request,name:string):string|null=>{
  const items=(request.headers.get("cookie")??"").split(";").map(x=>x.trim());
  const item=items.find(x=>x.startsWith(name+"="));
  return item?.slice(name.length+1)??null;
};
const audit=(request:Request,event:string,userId?:string)=>
  writeAuditLog({event,requestId:requestCorrelationId(request),
    method:request.method,path:new URL(request.url).pathname,
    outcome:event.endsWith("_success")?"success":"failure",resourceType:"authentication",
    ...(userId?{userId}:{})});

const safeJSONBody=async(request:Request):Promise<unknown>=>{
  if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json"||
      Number(request.headers.get("content-length")??0)>24_000)throw new Error("Invalid passkey content");
  const raw=await request.text();
  if(raw.length>24_000)throw new Error("Passkey request too large");
  return JSON.parse(raw) as unknown;
};
const sameOrigin=(request:Request)=>request.headers.get("origin")===PASSKEY_LINE_STEPUP_ORIGIN &&
  new URL(request.url).origin===PASSKEY_LINE_STEPUP_ORIGIN &&
  !["cross-site","same-site"].includes(request.headers.get("sec-fetch-site")??"");
const secureSession=async(request:Request,env:PasskeyHttpEnv)=>{
  const sessionCookie=cookieValue(request,"mahjong_session");
  if(!sessionCookie)return null;
  const userId=await authenticatedUserId(request,env);
  return userId?{userId,sessionCookie}:null;
};
const checkedProof=async(request:Request,env:PasskeyHttpEnv,verified:{
  userId:string;sessionCookie:string;
})=>{
  const proofToken=cookieValue(request,"mahjong_passkey_stepup");
  if(!proofToken)return null;
  const identity=await readPasskeyStepUpProof(env.DB,verified.userId,verified.sessionCookie,proofToken);
  if(!identity)return null;
  return {proofToken,identity};
};

/** null means this request belongs to the pre-existing LINE + score API. */
export const handleS2BPasskeyRequest=async (
  request:Request,env:PasskeyHttpEnv,
):Promise<Response|null>=>{
  const url=new URL(request.url);
  // Read-only capability probe. It never exposes private credentials, session
  // tokens or a way to change the server-controlled feature flag.
  if(url.pathname==="/api/auth/passkey/capabilities"){
    if(request.method!=="GET")return error("method_not_allowed",405);
    return reply({
      registrationEnabled:env.PASSKEY_REGISTRATION_ENABLED==="true" &&
        url.origin===PASSKEY_LINE_STEPUP_ORIGIN,
    },200);
  }
  // An unset (or anything other than the exact string "true") flag cannot
  // enable routes, including by accident in a Production deployment.
  if(env.PASSKEY_REGISTRATION_ENABLED!=="true")return null;
  const isCallback=url.pathname==="/api/auth/line/callback"&&
    isPasskeyStepUpState(url.searchParams.get("state"));
  const isProofStatus=url.pathname==="/api/auth/passkey/stepup/status";
  if(!isCallback&&!paths.has(url.pathname))return null;

  if(url.origin!==PASSKEY_LINE_STEPUP_ORIGIN)return error("invalid_passkey_origin",403);
  // Status is read-only and cannot consume a proof; authenticated Cookie is
  // required later. Every mutating route still requires POST + CSRF Origin.
  if(isProofStatus&&request.method!=="GET")return error("method_not_allowed",405);
  if(!isCallback&&!isProofStatus && (request.method!=="POST" || !sameOrigin(request))){
    audit(request,"passkey_origin_failure");
    return error("passkey_origin_denied",403);
  }
  if(isCallback&&request.method!=="GET")return error("method_not_allowed",405);

  let session:{userId:string;sessionCookie:string}|null;
  try{session=await secureSession(request,env);}
  catch{
    audit(request,"passkey_auth_store_failure");
    return authStoreUnavailableResponse();
  }
  if(!session){audit(request,"passkey_session_failure");return error("unauthorized",401);}

  const {userId,sessionCookie}=session;
  try{
    if(isProofStatus){
      const proof=await checkedProof(request,env,session);
      return reply({verified:proof!==null},200);
    }
    if(isCallback){
      const state=url.searchParams.get("state"),code=url.searchParams.get("code");
      if(!state||!code)return error("passkey_line_stepup_invalid",400);
      const proof=await finishPasskeyLineStepUp(env,state,code,userId,sessionCookie);
      if(proof.userId!==userId)return error("passkey_line_stepup_invalid",403);
      audit(request,"passkey_stepup_success",userId);
      return new Response(null,{status:302,headers:{
        "location":PASSKEY_LINE_STEPUP_ORIGIN+"/?passkey_stepup=verified",
        "set-cookie":secureProof(proof.proofToken),
        "cache-control":"no-store","referrer-policy":"no-referrer",
      }});
    }
    if(url.pathname==="/api/auth/passkey/stepup/start"){
      if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
        return error("invalid_content_type",415);
      const prepared=await beginPasskeyLineStepUp(env,userId,sessionCookie);
      audit(request,"passkey_stepup_started_success",userId);
      return new Response(JSON.stringify(prepared),{
        status:200,headers:{...noStore,"set-cookie":clearProof},
      });
    }
    if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")
      return error("invalid_content_type",415);
    const proof=await checkedProof(request,env,session);
    if(!proof){audit(request,"passkey_stepup_required",userId);return error("passkey_recent_line_required",403);}
    if(url.pathname==="/api/auth/passkey/register/options"){
      const options=await beginExistingUserPasskeyRegistration(env.DB,{
        sessionUserId:userId,lineIdentity:proof.identity,
      });
      return reply(options,200);
    }
    // POST verify: proof is one-shot BEFORE credential insert. Bad response
    // consumes the proof; recovery is explicit LINE step-up reauthentication.
    const body=await safeJSONBody(request);
    if(!body||typeof body!=="object"||Array.isArray(body))return error("invalid_registration_body",400);
    const b=body as Record<string,unknown>;
    if(typeof b.flowId!=="string"||b.flowId.length>100 ||
        !b.credential||typeof b.credential!=="object"||Array.isArray(b.credential))
      return error("invalid_registration_body",400);
    if(!await consumePasskeyStepUpProof(env.DB,userId,sessionCookie,proof.proofToken))
      return error("passkey_recent_line_required",403);
    const result=await finishExistingUserPasskeyRegistration(env.DB,{
      sessionUserId:userId,lineIdentity:proof.identity,
    },b.flowId,b.credential as RegistrationResponseJSON);
    audit(request,"passkey_registration_success",userId);
    return new Response(JSON.stringify({registered:true,credentialId:result.credentialId}),{
      status:201,headers:{...noStore,"set-cookie":clearProof},
    });
  }catch{
    audit(request,"passkey_registration_failure",userId);
    // Never leak raw LINE errors, credential detail, challenges or SQL messages.
    return error("passkey_registration_failed",409);
  }
};
