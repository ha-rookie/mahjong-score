/**
 * Phase 4 S2-B – dedicated LINE step-up for EXISTING User passkey enrollment.
 * INTERNAL ONLY: this module is not wired to any HTTP route or UI.
 * The future route MUST validate CSRF Origin, signed authVersion session,
 * verified same-browser cookie, rate limit, HTTPS host and feature flag.
 *
 * Never reuse the regular LINE login callback's User-creation behavior.
 * Never log state, nonce, authorization code, ID token or proof secret.
 */
import {
  resolvePasskeyRelyingParty,
  PASSKEY_PRODUCTION_ORIGIN, PASSKEY_PRODUCTION_RP_ID,
  type PasskeyRelyingPartyEnv,
} from "./passkey-rp-config";

type Config = PasskeyRelyingPartyEnv & { DB:D1Database };
type VerifiedLineToken = {
  iss?: unknown; aud?: unknown; sub?: unknown; nonce?: unknown;
  exp?: unknown; iat?: unknown; auth_time?: unknown; amr?: unknown;
};
type StateRow = { id: string; userId: string; nonce: string; createdAt: string };
export type StepUpProof = { proofToken: string; userId: string; authenticationTimeSeconds: number };
export const STEPUP_STATE_TTL_MS = 10 * 60 * 1000;
export const STEPUP_PROOF_TTL_SECONDS = 300;
export const STEPUP_MAX_HOURLY_STARTS = 6;
const encode = new TextEncoder();
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const digest = async (token: string): Promise<string> => {
  const bytes = await crypto.subtle.digest("SHA-256", encode.encode(token));
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
const validState = (s: string) => /^s2b_[A-Za-z0-9_-]{43}$/.test(s);
const validNow = (d: Date) => Number.isFinite(d.getTime());
const requireBinding = (userId: string, sessionCookieValue: string) => {
  if (!userId || userId.length>256 || !sessionCookieValue || sessionCookieValue.length>4096)
    throw new Error("A verified existing User session is required");
};

export const beginPasskeyLineStepUp = async (
  env: Config,
  userId: string,
  signedSessionCookie: string,
  now = new Date(),
): Promise<{ authorizationUrl: string }> => {
  requireBinding(userId,signedSessionCookie);
  const rp=resolvePasskeyRelyingParty(env);
  if (!validNow(now) || !env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET)
    throw new Error("LINE step-up configuration unavailable");
  const identity = await env.DB.prepare(
    "SELECT 1 AS ok FROM external_identities WHERE provider='line' AND user_id=?"
  ).bind(userId).first<{ok:number}>();
  if (identity?.ok!==1) throw new Error("Existing User has no linked LINE identity");

  const recent = new Date(now.getTime()-60*60*1000).toISOString();
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM passkey_line_stepups WHERE user_id=? AND created_at>=?"
  ).bind(userId,recent).first<{total:number}>();
  if (Number(count?.total??0) >= STEPUP_MAX_HOURLY_STARTS)
    throw new Error("LINE reauthentication start rate limit reached");

  const state = "s2b_" + randomToken(), nonce = randomToken(), id = crypto.randomUUID();
  const expires = new Date(now.getTime()+STEPUP_STATE_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO passkey_line_stepups(id,state_hash,nonce,user_id,session_hash,created_at,expires_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(id,await digest(state),nonce,userId,await digest(signedSessionCookie),
    now.toISOString(),expires).run();
  const to=new URL("https://access.line.me/oauth2/v2.1/authorize");
  to.search=new URLSearchParams({
    response_type:"code",client_id:env.LINE_CHANNEL_ID,redirect_uri:rp.callbackUrl,
    state,scope:"profile openid",nonce,prompt:"login",max_age:"0",
  }).toString();
  return {authorizationUrl:to.toString()};
};

export const isPasskeyStepUpState = (value: string | null): boolean =>
  value !== null && value.startsWith("s2b_");

/** Complete a verified LINE OAuth callback, without ever issuing a normal login session. */
export const finishPasskeyLineStepUp = async (
  env: Config,
  state: string,
  code: string,
  sessionUserId: string,
  signedSessionCookie: string,
  now = new Date(),
  fetchProvider: typeof fetch = fetch,
): Promise<StepUpProof> => {
  requireBinding(sessionUserId,signedSessionCookie);
  const rp=resolvePasskeyRelyingParty(env);
  if (!validState(state) || !code || code.length>4096 || !validNow(now) ||
      !env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET)
    throw new Error("Invalid LINE step-up callback");

  const stateHash=await digest(state), sessionHash=await digest(signedSessionCookie);
  // The conditional UPDATE is an atomic one-shot claim BEFORE contacting LINE.
  // A network error consumes the flow (safe to restart, never replay).
  const claimed = await env.DB.prepare(
    "UPDATE passkey_line_stepups SET claimed_at=? WHERE state_hash=? AND user_id=? AND session_hash=? AND claimed_at IS NULL AND expires_at>? RETURNING id,user_id AS userId,nonce,created_at AS createdAt"
  ).bind(now.toISOString(),stateHash,sessionUserId,sessionHash,now.toISOString()).first<StateRow>();
  if (!claimed || claimed.userId!==sessionUserId) throw new Error("LINE step-up invalid or already claimed");

  const tokenResp=await fetchProvider("https://api.line.me/oauth2/v2.1/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"authorization_code",code,redirect_uri:rp.callbackUrl,
      client_id:env.LINE_CHANNEL_ID,client_secret:env.LINE_CHANNEL_SECRET,
    }),
  });
  if (!tokenResp.ok) throw new Error("LINE step-up code exchange rejected");
  const token=await tokenResp.json() as {id_token?:unknown};
  if (typeof token.id_token!=="string" || token.id_token.length>10000)
    throw new Error("LINE step-up ID token unavailable");
  const verifyResp=await fetchProvider("https://api.line.me/oauth2/v2.1/verify",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({id_token:token.id_token,client_id:env.LINE_CHANNEL_ID,nonce:claimed.nonce}),
  });
  if (!verifyResp.ok) throw new Error("LINE step-up ID token rejected");
  const identity=await verifyResp.json() as VerifiedLineToken;
  const nowSec=Math.floor(now.getTime()/1000),createdSec=Math.floor(Date.parse(claimed.createdAt)/1000);
  if (identity.iss!=="https://access.line.me" ||
      identity.aud!==env.LINE_CHANNEL_ID ||
      identity.nonce!==claimed.nonce ||
      typeof identity.sub!=="string" || !identity.sub ||
      typeof identity.exp!=="number" || !Number.isSafeInteger(identity.exp) || identity.exp<=nowSec ||
      typeof identity.iat!=="number" || !Number.isSafeInteger(identity.iat) ||
      identity.iat>nowSec+30 ||
      typeof identity.auth_time!=="number" || !Number.isSafeInteger(identity.auth_time) ||
      identity.auth_time>nowSec+30 ||
      nowSec-identity.auth_time>STEPUP_PROOF_TTL_SECONDS ||
      !Number.isFinite(createdSec) || identity.auth_time < createdSec-30 ||
      // LINE documents that amr can be absent. Until a real provider
      // integration is reviewed, fail closed rather than infer user presence.
      // Reject empty, auto-login and unknown authentication methods.
      !Array.isArray(identity.amr) || identity.amr.length===0 ||
      identity.amr.some(method=>typeof method!=="string" ||
        !["pwd","lineqr","linesso","mfa"].includes(method))) {
    throw new Error("LINE step-up freshness or token claims invalid");
  }
  const linked=await env.DB.prepare(
    "SELECT user_id AS userId FROM external_identities WHERE provider='line' AND provider_subject=?"
  ).bind(identity.sub).first<{userId:string}>();
  if (linked?.userId!==sessionUserId)
    throw new Error("LINE step-up account mismatch");

  const proofToken=randomToken(),proofHash=await digest(proofToken);
  const updated=await env.DB.prepare(
    "UPDATE passkey_line_stepups SET proof_hash=?,reauth_at=? WHERE id=? AND user_id=? AND session_hash=? AND claimed_at IS NOT NULL AND proof_hash IS NULL AND expires_at>?"
  ).bind(proofHash,new Date(identity.auth_time*1000).toISOString(),claimed.id,
    sessionUserId,sessionHash,now.toISOString()).run();
  if (updated.meta.changes!==1) throw new Error("LINE step-up proof update failed");
  return {proofToken,userId:sessionUserId,authenticationTimeSeconds:identity.auth_time};
};

/** Internal guard: only a recently verified proof from the same browser Cookie. */
export const readPasskeyStepUpProof = async (
  db:D1Database,userId:string,signedSessionCookie:string,proofToken:string,
  now = new Date(),
):Promise<{reauthenticatedUserId:string;authenticationTimeSeconds:number}|null>=>{
  requireBinding(userId,signedSessionCookie);
  if (!/^[A-Za-z0-9_-]{43}$/.test(proofToken) || !validNow(now))return null;
  const since=new Date(now.getTime()-STEPUP_PROOF_TTL_SECONDS*1000).toISOString();
  const row=await db.prepare(
    "SELECT user_id AS userId,reauth_at AS reauthAt FROM passkey_line_stepups WHERE proof_hash=? AND user_id=? AND session_hash=? AND proof_consumed_at IS NULL AND reauth_at>=? AND reauth_at<=? AND claimed_at IS NOT NULL"
  ).bind(await digest(proofToken),userId,await digest(signedSessionCookie),
    since,new Date(now.getTime()+30_000).toISOString()).first<{userId:string;reauthAt:string}>();
  if (!row || row.userId!==userId)return null;
  const authenticationTimeSeconds=Math.floor(Date.parse(row.reauthAt)/1000);
  return Number.isSafeInteger(authenticationTimeSeconds)?
    {reauthenticatedUserId:userId,authenticationTimeSeconds}:null;
};

/** Called once before the irreversible credential insert; failure requires a new step-up. */
export const consumePasskeyStepUpProof = async (
  db:D1Database,userId:string,signedSessionCookie:string,proofToken:string,
  now=new Date(),
):Promise<boolean>=>{
  requireBinding(userId,signedSessionCookie);
  if (!/^[A-Za-z0-9_-]{43}$/.test(proofToken)||!validNow(now))return false;
  const since=new Date(now.getTime()-STEPUP_PROOF_TTL_SECONDS*1000).toISOString();
  const row=await db.prepare(
    "UPDATE passkey_line_stepups SET proof_consumed_at=? WHERE proof_hash=? AND user_id=? AND session_hash=? AND proof_consumed_at IS NULL AND claimed_at IS NOT NULL AND reauth_at>=? AND reauth_at<=? RETURNING id"
  ).bind(now.toISOString(),await digest(proofToken),userId,await digest(signedSessionCookie),
    since,new Date(now.getTime()+30_000).toISOString()).first<{id:string}>();
  return Boolean(row?.id);
};

export const PASSKEY_LINE_STEPUP_ORIGIN=PASSKEY_PRODUCTION_ORIGIN;
export const PASSKEY_LINE_STEPUP_RPID=PASSKEY_PRODUCTION_RP_ID;
