/**
 * LINE-free passkey onboarding and sign-in for Issue #345.
 * The existing unclaimed Group Player is selected by its one-time invitation.
 * Neither LINE identity nor the existing games/results tables is changed.
 */
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON, AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import {
  issuePasskeyChallenge,readPasskeyChallenge,consumePasskeyChallenge,
  hashPasskeyChallenge,type ChallengeScope,
} from "./passkey-challenge";

export const PASSKEY_ORIGIN="https://mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_RP_ID="mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_INVITE_TTL_MS=120_000;
const encoder=new TextEncoder();
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const un64=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")
  .padEnd(Math.ceil(value.length/4)*4,"=")),x=>x.charCodeAt(0));
const canonical=(value:unknown):value is string=>typeof value==="string"&&
  /^[A-Za-z0-9_-]{1,2048}$/.test(value)&&value.length%4!==1&&b64(un64(value))===value;
const validToken=(value:unknown):value is string=>typeof value==="string"&&
  /^[A-Za-z0-9_-]{43}$/.test(value);
const validFlow=(value:unknown):value is string=>typeof value==="string"&&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hashToken=async(token:string)=>b64(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(token))));
const registerScope=(invitationId:string):ChallengeScope=>({
  purpose:"register_invite",userId:null,invitationId,expectedOrigin:PASSKEY_ORIGIN,rpId:PASSKEY_RP_ID,
});
const loginScope:ChallengeScope={
  purpose:"login",userId:null,invitationId:null,expectedOrigin:PASSKEY_ORIGIN,rpId:PASSKEY_RP_ID,
};
const challengeFrom=(response:{response:{clientDataJSON:string}})=>{
  const object=JSON.parse(new TextDecoder().decode(un64(response.response.clientDataJSON))) as {challenge?:unknown};
  if(!canonical(object.challenge))throw new Error("WebAuthn challenge missing");
  return object.challenge;
};
type Invite={
  id:string;groupId:string;playerId:string;playerName:string;groupName:string;
  expiresAt:string;
};
export const findUnclaimedInvite=async(db:D1Database,token:string,now=new Date())=>{
  if(!validToken(token))return null;
  return db.prepare(
    "SELECT i.id,i.group_id AS groupId,i.player_id AS playerId,p.display_name AS playerName,g.name AS groupName,i.expires_at AS expiresAt FROM invitations i JOIN group_players gp ON gp.group_id=i.group_id AND gp.player_id=i.player_id JOIN players p ON p.id=i.player_id JOIN groups g ON g.id=i.group_id WHERE i.token_hash=? AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>? AND gp.active=1 AND gp.user_id IS NULL"
  ).bind(await hashToken(token),now.toISOString()).first<Invite>();
};
export const beginInvitePasskey=async(db:D1Database,token:string,now=new Date())=>{
  const invite=await findUnclaimedInvite(db,token,now);
  if(!invite)throw new Error("Invite invalid, linked or expired");
  const challenge=await issuePasskeyChallenge(db,registerScope(invite.id),now);
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",
    encoder.encode("sanma:invitation:"+invite.id)));
  const options=await generateRegistrationOptions({
    rpName:"三麻スコア",rpID:PASSKEY_RP_ID,
    userName:"sanma-"+b64(digest).slice(0,16),
    userID:digest,challenge:un64(challenge.challenge),
    attestationType:"none",supportedAlgorithmIDs:[-7],timeout:120_000,
    authenticatorSelection:{residentKey:"required",userVerification:"required"},
  });
  if(options.challenge!==challenge.challenge)throw new Error("Registration challenge mismatch");
  return {flowId:challenge.id,options,expiresAt:challenge.expiresAt,
    playerName:invite.playerName,groupName:invite.groupName};
};

/** All member + credential writes share one D1.batch transaction.
 * The final INSERT's CHECK(sign_count>=0) deliberately ABORTS the entire
 * transaction when any conditional invite/member link failed.
 * Checking meta.changes AFTER batch alone does NOT rollback anything.
 */
export const finishInvitePasskey=async(
  db:D1Database,token:string,flowId:string,response:RegistrationResponseJSON,now=new Date(),
):Promise<{userId:string;playerId:string;groupId:string}>=>{
  if(!validToken(token)||!validFlow(flowId)||!response||!canonical(response.id))
    throw new Error("Invalid invitation registration request");
  const invite=await findUnclaimedInvite(db,token,now);
  if(!invite)throw new Error("Invitation no longer active");
  const scope=registerScope(invite.id);
  const pending=await readPasskeyChallenge(db,flowId,scope,now);
  if(!pending)throw new Error("Invite challenge expired");
  const verified=await verifyRegistrationResponse({
    response,expectedChallenge:async value=>canonical(value)&&
      await hashPasskeyChallenge(value)===pending.challengeHash,
    expectedOrigin:pending.expectedOrigin,expectedRPID:pending.rpId,
    requireUserVerification:true,supportedAlgorithmIDs:[-7],
  });
  const info=verified.registrationInfo;
  if(!verified.verified||!info?.credential||info.credential.id!==response.id||
     !info.credential.publicKey?.byteLength||
     !Number.isSafeInteger(info.credential.counter)||info.credential.counter<0)
    throw new Error("Passkey attestation failed");
  const claimAt=new Date(Math.max(now.getTime(),Date.now()));
  const consumed=await consumePasskeyChallenge(db,flowId,scope,challengeFrom(response),claimAt);
  if(!consumed)throw new Error("Invite challenge already claimed");
  const userId=crypto.randomUUID(),time=claimAt.toISOString(),credential=info.credential;
  const tokenDigest=await hashToken(token);
  const results=await db.batch([
    db.prepare(
      "INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)"
    ).bind(userId,invite.playerName,time,time),
    db.prepare(
      "UPDATE group_players SET user_id=? WHERE group_id=? AND player_id=? AND active=1 AND user_id IS NULL AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?)"
    ).bind(userId,invite.groupId,invite.playerId,invite.id,tokenDigest,time),
    db.prepare(
      "INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) SELECT ?,?,'member',?,? WHERE EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND active=1 AND user_id=?)"
    ).bind(invite.groupId,userId,time,time,invite.groupId,invite.playerId,userId),
    db.prepare(
      "UPDATE invitations SET used_at=?,used_by_user_id=? WHERE id=? AND token_hash=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND user_id=? AND active=1)"
    ).bind(time,userId,invite.id,tokenDigest,time,invite.groupId,invite.playerId,userId),
    db.prepare(
      "INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports,device_type,backed_up,created_at) VALUES(?,?,?,?,CASE WHEN EXISTS(SELECT 1 FROM invitations WHERE id=? AND token_hash=? AND used_by_user_id=? AND used_at=? AND revoked_at IS NULL) AND EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND user_id=? AND active=1) AND EXISTS(SELECT 1 FROM group_memberships WHERE group_id=? AND user_id=? AND role='member') THEN ? ELSE -1 END,?,?,?,?)"
    ).bind(crypto.randomUUID(),userId,credential.id,credential.publicKey,
      invite.id,tokenDigest,userId,time,invite.groupId,invite.playerId,userId,
      invite.groupId,userId,credential.counter,JSON.stringify(credential.transports??[]),
      info.credentialDeviceType,info.credentialBackedUp?1:0,time),
  ]);
  // This check is defense-in-depth: the last INSERT must have thrown to abort
  // if the guard failed. All 5 statements must change exactly one row.
  if(results.length!==5||results.some(result=>result.meta.changes!==1))
    throw new Error("Registration atomicity not confirmed");
  return {userId,playerId:invite.playerId,groupId:invite.groupId};
};

export const beginPasskeyLogin=async(db:D1Database,now=new Date())=>{
  const challenge=await issuePasskeyChallenge(db,loginScope,now);
  const options=await generateAuthenticationOptions({
    rpID:PASSKEY_RP_ID,challenge:un64(challenge.challenge),
    allowCredentials:[],userVerification:"required",timeout:120_000,
  });
  if(options.challenge!==challenge.challenge)throw new Error("Login challenge mismatch");
  return {flowId:challenge.id,options,expiresAt:challenge.expiresAt};
};
type CredentialRow={
  id:string;userId:string;credentialId:string;publicKey:Uint8Array|ArrayBuffer;
  signCount:number;transports:string|null;deviceType:string|null;backedUp:number|null;
};
export const finishPasskeyLogin=async(
  db:D1Database,flowId:string,response:AuthenticationResponseJSON,now=new Date(),
):Promise<{userId:string}>=>{
  if(!validFlow(flowId)||!response||!canonical(response.id))
    throw new Error("Invalid authentication response");
  const pending=await readPasskeyChallenge(db,flowId,loginScope,now);
  if(!pending)throw new Error("Login challenge missing");
  const row=await db.prepare(
    "SELECT c.id,c.user_id AS userId,c.credential_id AS credentialId,c.public_key AS publicKey,c.sign_count AS signCount,c.transports,c.device_type AS deviceType,c.backed_up AS backedUp FROM passkey_credentials c JOIN users u ON u.id=c.user_id WHERE c.credential_id=? AND c.revoked_at IS NULL"
  ).bind(response.id).first<CredentialRow>();
  if(!row||!canonical(row.credentialId)||row.credentialId!==response.id||
     !Number.isSafeInteger(row.signCount)||row.signCount<0)
    throw new Error("Credential unknown or revoked");
  const verification=await verifyAuthenticationResponse({
    response,expectedChallenge:async value=>canonical(value)&&
      await hashPasskeyChallenge(value)===pending.challengeHash,
    expectedOrigin:pending.expectedOrigin,expectedRPID:pending.rpId,
    credential:{
      id:row.credentialId,publicKey:new Uint8Array(row.publicKey),
      counter:row.signCount,
      transports:row.transports?JSON.parse(row.transports) as AuthenticatorTransport[]:[],
    },
    requireUserVerification:true,
  });
  if(!verification.verified||!verification.authenticationInfo?.userVerified)
    throw new Error("Signature or user verification failed");
  const counter=verification.authenticationInfo.newCounter;
  if(!Number.isSafeInteger(counter)||counter<0)throw new Error("Invalid sign counter");
  const claimAt=new Date(Math.max(now.getTime(),Date.now()));
  if(!await consumePasskeyChallenge(db,flowId,loginScope,challengeFrom(response),claimAt))
    throw new Error("Login challenge already used");
  const updated=await db.prepare(
    "UPDATE passkey_credentials SET sign_count=?,last_used_at=? WHERE id=? AND user_id=? AND credential_id=? AND sign_count=? AND revoked_at IS NULL"
  ).bind(counter,claimAt.toISOString(),row.id,row.userId,row.credentialId,row.signCount).run();
  if(updated.meta.changes!==1)throw new Error("Credential was concurrently changed");
  return {userId:row.userId};
};
