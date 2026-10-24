/**
 * P0 #345: regain access to an EXISTING LINE-linked User using a passkey.
 * System administrator identifies the exact Group/Player/User before issuing
 * a single-use grant. No new User, Player, Group or score is created.
 */
import {generateRegistrationOptions,verifyRegistrationResponse} from "@simplewebauthn/server";
import type {RegistrationResponseJSON} from "@simplewebauthn/server";
import {
  issuePasskeyChallenge,readPasskeyChallenge,consumePasskeyChallenge,
  hashPasskeyChallenge,type ChallengeScope,
} from "./passkey-challenge";
import {PASSKEY_ORIGIN,PASSKEY_RP_ID} from "./passkey-line-free";

const encoder=new TextEncoder();
const base64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const decode=(input:string)=>Uint8Array.from(atob(input.replace(/-/g,"+").replace(/_/g,"/")
  .padEnd(Math.ceil(input.length/4)*4,"=")),x=>x.charCodeAt(0));
const validToken=(t:unknown):t is string=>typeof t==="string"&&/^[A-Za-z0-9_-]{43}$/.test(t);
const validId=(t:unknown):t is string=>typeof t==="string"&&t.length>0&&t.length<=160;
const validFlow=(t:unknown):t is string=>typeof t==="string"&&/^[a-f0-9-]{36}$/i.test(t);
const canonical=(value:unknown):value is string=>
  typeof value==="string"&&/^[A-Za-z0-9_-]{1,2048}$/.test(value)&&
  value.length%4!==1&&base64(decode(value))===value;
const hash=async(value:string)=>base64(new Uint8Array(await crypto.subtle.digest(
  "SHA-256",encoder.encode(value))));
export const PASSKEY_RECOVERY_TTL_MS=24*60*60*1000;
export type RecoveryGrant={
  id:string;userId:string;groupId:string;playerId:string;playerName:string;
  groupName:string;expiresAt:string;
};
const scope=(userId:string):ChallengeScope=>({
  purpose:"register_user",userId,invitationId:null,
  expectedOrigin:PASSKEY_ORIGIN,rpId:PASSKEY_RP_ID,
});
const grantSql="SELECT r.id,r.user_id AS userId,r.group_id AS groupId,r.player_id AS playerId,p.display_name AS playerName,g.name AS groupName,r.expires_at AS expiresAt FROM passkey_recovery_grants r JOIN group_players gp ON gp.group_id=r.group_id AND gp.player_id=r.player_id JOIN group_memberships gm ON gm.group_id=r.group_id AND gm.user_id=r.user_id JOIN users u ON u.id=r.user_id JOIN players p ON p.id=r.player_id JOIN groups g ON g.id=r.group_id WHERE r.token_hash=? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at>? AND gp.active=1 AND gp.user_id=r.user_id AND u.system_role='user'";

export const findPasskeyRecoveryGrant=async(db:D1Database,token:string,now=new Date())=>{
  if(!validToken(token))return null;
  return db.prepare(grantSql).bind(await hash(token),now.toISOString()).first<RecoveryGrant>();
};

/** Only the authenticated SYSTEM admin may grant control of an old User.
 * A group administrator could otherwise gain access to a User's other groups.
 */
export const createPasskeyRecoveryGrant=async(
  db:D1Database,actorUserId:string,groupId:string,playerId:string,
  expectedUserId:string,now=new Date(),
)=>{
  if(![actorUserId,groupId,playerId,expectedUserId].every(validId))
    throw new Error("Invalid recovery selection");
  const admin=await db.prepare(
    "SELECT id FROM users WHERE id=? AND system_role='admin'"
  ).bind(actorUserId).first<{id:string}>();
  if(!admin)throw new Error("System administrator required");
  const target=await db.prepare(
    "SELECT gp.user_id AS userId FROM group_players gp JOIN users u ON u.id=gp.user_id JOIN group_memberships gm ON gm.user_id=u.id AND gm.group_id=gp.group_id WHERE gp.group_id=? AND gp.player_id=? AND gp.user_id=? AND gp.active=1 AND u.system_role='user'"
  ).bind(groupId,playerId,expectedUserId).first<{userId:string}>();
  if(target?.userId!==expectedUserId)throw new Error("Target User/Player link changed");
  const token=base64(crypto.getRandomValues(new Uint8Array(32)));
  const issuedAt=now.toISOString(),expiresAt=new Date(now.getTime()+PASSKEY_RECOVERY_TTL_MS).toISOString();
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare("UPDATE passkey_recovery_grants SET revoked_at=? WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL")
      .bind(issuedAt,expectedUserId),
    db.prepare("INSERT INTO passkey_recovery_grants(id,token_hash,user_id,group_id,player_id,created_by_user_id,created_at,expires_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND system_role='admin') AND EXISTS(SELECT 1 FROM group_players gp JOIN group_memberships gm ON gm.group_id=gp.group_id AND gm.user_id=gp.user_id JOIN users u ON u.id=gp.user_id WHERE gp.group_id=? AND gp.player_id=? AND gp.user_id=? AND gp.active=1 AND u.system_role='user')")
      .bind(id,await hash(token),expectedUserId,groupId,playerId,actorUserId,issuedAt,expiresAt,
        actorUserId,groupId,playerId,expectedUserId),
  ]);
  // Strict check: a losing concurrent administrator cannot issue a valid link.
  const saved=await db.prepare("SELECT id FROM passkey_recovery_grants WHERE id=? AND used_at IS NULL AND revoked_at IS NULL")
    .bind(id).first<{id:string}>();
  if(saved?.id!==id)throw new Error("Recovery grant not saved");
  return {token,expiresAt,userId:expectedUserId,groupId,playerId};
};

export const beginExistingUserRecovery=async(db:D1Database,token:string,now=new Date())=>{
  const grant=await findPasskeyRecoveryGrant(db,token,now);
  if(!grant)throw new Error("Recovery link invalid or expired");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",
    encoder.encode("sanma:user:"+grant.userId)));
  const challenge=await issuePasskeyChallenge(db,scope(grant.userId),now);
  const saved=await db.prepare(
    "SELECT credential_id AS credentialId,transports FROM passkey_credentials WHERE user_id=? AND revoked_at IS NULL"
  ).bind(grant.userId).all<{credentialId:string;transports:string|null}>();
  const options=await generateRegistrationOptions({
    rpName:"三麻スコア",rpID:PASSKEY_RP_ID,
    userName:"sanma-"+base64(digest).slice(0,16),userID:digest,
    challenge:decode(challenge.challenge),
    attestationType:"none",supportedAlgorithmIDs:[-7],timeout:120000,
    excludeCredentials:saved.results.filter(x=>canonical(x.credentialId)).map(x=>({
      id:x.credentialId,transports:x.transports?JSON.parse(x.transports) as AuthenticatorTransport[]:undefined,
    })),
    authenticatorSelection:{residentKey:"required",userVerification:"required"},
  });
  if(options.challenge!==challenge.challenge)throw new Error("Challenge mismatch");
  return {flowId:challenge.id,options,expiresAt:challenge.expiresAt,
    playerName:grant.playerName,groupName:grant.groupName};
};

/** A valid WebAuthn response adds a credential to the EXISTING User ID.
 * The last INSERT uses SQLite changes() from the immediately previous UPDATE.
 * A consumed/revoked grant causes CHECK(sign_count>=0) failure, rolling back
 * both operations in D1.batch(). Never trust batch's changes count for rollback.
 */
export const finishExistingUserRecovery=async(
  db:D1Database,token:string,flowId:string,response:RegistrationResponseJSON,now=new Date(),
):Promise<{userId:string;groupId:string;playerId:string}>=>{
  if(!validToken(token)||!validFlow(flowId)||!response||!canonical(response.id))
    throw new Error("Invalid recovery response");
  const grant=await findPasskeyRecoveryGrant(db,token,now);
  if(!grant)throw new Error("Recovery expired or already used");
  const bindScope=scope(grant.userId);
  const pending=await readPasskeyChallenge(db,flowId,bindScope,now);
  if(!pending)throw new Error("Recovery challenge expired");
  const verified=await verifyRegistrationResponse({
    response,expectedChallenge:async x=>canonical(x)&&
      await hashPasskeyChallenge(x)===pending.challengeHash,
    expectedOrigin:pending.expectedOrigin,expectedRPID:pending.rpId,
    requireUserVerification:true,supportedAlgorithmIDs:[-7],
  });
  const info=verified.registrationInfo;
  if(!verified.verified||!info?.credential||info.credential.id!==response.id||
     !info.credential.publicKey?.byteLength||
     !Number.isSafeInteger(info.credential.counter)||info.credential.counter<0)
    throw new Error("WebAuthn recovery verification failed");
  const claimAt=new Date(Math.max(now.getTime(),Date.now()));
  const consumedChallenge=new TextDecoder().decode(decode(response.response.clientDataJSON));
  const client=JSON.parse(consumedChallenge) as {challenge?:unknown};
  if(!canonical(client.challenge)||!await consumePasskeyChallenge(
    db,flowId,bindScope,client.challenge,claimAt,
  ))throw new Error("Challenge already consumed");
  const t=claimAt.toISOString(),tokenDigest=await hash(token);
  const cred=info.credential;
  const result=await db.batch([
    db.prepare(
      "UPDATE passkey_recovery_grants SET used_at=? WHERE id=? AND token_hash=? AND user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM group_players gp JOIN group_memberships gm ON gm.user_id=gp.user_id AND gm.group_id=gp.group_id JOIN users u ON u.id=gp.user_id WHERE gp.group_id=? AND gp.player_id=? AND gp.user_id=? AND gp.active=1 AND u.system_role='user')"
    ).bind(t,grant.id,tokenDigest,grant.userId,t,grant.groupId,grant.playerId,grant.userId),
    db.prepare(
      "INSERT INTO passkey_credentials(id,user_id,credential_id,public_key,sign_count,transports,device_type,backed_up,created_at) VALUES(?,?,?,?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM passkey_recovery_grants r JOIN group_players gp ON gp.group_id=r.group_id AND gp.player_id=r.player_id WHERE r.id=? AND r.token_hash=? AND r.user_id=? AND r.used_at=? AND r.revoked_at IS NULL AND gp.user_id=r.user_id AND gp.active=1) THEN ? ELSE -1 END,?,?,?,?)"
    ).bind(crypto.randomUUID(),grant.userId,cred.id,cred.publicKey,
      grant.id,tokenDigest,grant.userId,t,cred.counter,
      JSON.stringify(cred.transports??[]),info.credentialDeviceType,
      info.credentialBackedUp?1:0,t),
  ]);
  if(result.length!==2||result.some(x=>x.meta.changes!==1))
    throw new Error("Recovery write not confirmed");
  return {userId:grant.userId,groupId:grant.groupId,playerId:grant.playerId};
};
