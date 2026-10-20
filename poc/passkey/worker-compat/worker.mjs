import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { redeemInvitationById } from '../../../src/worker/auth/line-login.ts';

// Synthetic authenticator for S0 testing ONLY. No real user/passkey/DB/session involved.
const encoder = new TextEncoder();
const origin = 'http://localhost:8799';
const rpID = 'localhost';
const toBytes = v => v instanceof Uint8Array ? v : new Uint8Array(v);
const join = (...parts) => { const items = parts.map(toBytes); const out = new Uint8Array(items.reduce((s,x)=>s+x.length,0)); let p=0; for (const x of items) {out.set(x,p);p+=x.length;} return out; };
const sha = async b => new Uint8Array(await crypto.subtle.digest('SHA-256',b));
const b64 = b => btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const fromB64 = s => Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(s.length/4)*4,'=')), c=>c.charCodeAt(0));
const cborBytes = b => b.length < 24 ? join(Uint8Array.of(0x40+b.length), b) : b.length <= 255 ? join(Uint8Array.of(0x58,b.length),b) : join(Uint8Array.of(0x59,b.length >> 8,b.length & 255),b);
const cborText = s => {const b=encoder.encode(s); if(b.length>=24) throw Error('S0 text too long');return join(Uint8Array.of(0x60+b.length),b);};
const coseP256 = jwk => join(Uint8Array.of(0xa5, 0x01,0x02, 0x03,0x26, 0x20,0x01, 0x21), cborBytes(fromB64(jwk.x)), Uint8Array.of(0x22), cborBytes(fromB64(jwk.y)));
function rawToDer(raw) {
  if(raw.length!==64) throw Error('Only P256 raw ECDSA supported');
  const encInt = part => {let i=0;while(i<part.length-1 && part[i]===0)i++;let v=part.subarray(i);if(v[0]&0x80)v=join(Uint8Array.of(0),v);return join(Uint8Array.of(0x02,v.length),v);};
  const sequence=join(encInt(raw.subarray(0,32)),encInt(raw.subarray(32,64)));return join(Uint8Array.of(0x30,sequence.length),sequence);
}

async function run() {
  const registrationOptions = await generateRegistrationOptions({
    rpName:'S0 Isolated WebAuthn Probe', rpID, userName:'synthetic-s0-user',
    userID:crypto.getRandomValues(new Uint8Array(32)), attestationType:'none',
    supportedAlgorithmIDs:[-7],
    authenticatorSelection:{residentKey:'required',userVerification:'required'},
  });
  if(!registrationOptions.challenge || registrationOptions.rp.id!==rpID)throw Error('registration options invalid');
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
  const credentialID=crypto.getRandomValues(new Uint8Array(32));
  const authDataRegister=join(await sha(encoder.encode(rpID)),Uint8Array.of(0x45,0,0,0,0),new Uint8Array(16),Uint8Array.of(0,credentialID.length),credentialID,coseP256(jwk));
  // CBOR {fmt:'none', attStmt:{}, authData:<authenticatorData>}
  const attObj=join(Uint8Array.of(0xa3),cborText('fmt'),cborText('none'),cborText('attStmt'),Uint8Array.of(0xa0),cborText('authData'),cborBytes(authDataRegister));
  const clientReg=encoder.encode(JSON.stringify({type:'webauthn.create',challenge:registrationOptions.challenge,origin,crossOrigin:false}));
  const id=b64(credentialID);
  const registration=await verifyRegistrationResponse({
    response:{id,rawId:id,type:'public-key',response:{clientDataJSON:b64(clientReg),attestationObject:b64(attObj),transports:['internal']},clientExtensionResults:{}},
    expectedChallenge:registrationOptions.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
  });
  if(!registration.verified || !registration.registrationInfo?.credential?.publicKey)throw Error('registration verification failed');
  const authOpts=await generateAuthenticationOptions({rpID,allowCredentials:[],userVerification:'required'});
  if(authOpts.allowCredentials?.length)throw Error('discoverable login did not use empty allowed credentials');
  const authData=join(await sha(encoder.encode(rpID)),Uint8Array.of(0x05,0,0,0,1));
  const clientAuth=encoder.encode(JSON.stringify({type:'webauthn.get',challenge:authOpts.challenge,origin,crossOrigin:false}));
  const payload=join(authData,await sha(clientAuth));
  const signature=rawToDer(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,payload)));
  const assertion={id,rawId:id,type:'public-key',response:{authenticatorData:b64(authData),clientDataJSON:b64(clientAuth),signature:b64(signature),userHandle:null},clientExtensionResults:{}};
  const credential={id,publicKey:registration.registrationInfo.credential.publicKey,counter:0,transports:['internal']};
  const auth=await verifyAuthenticationResponse({response:assertion,expectedChallenge:authOpts.challenge,expectedOrigin:origin,expectedRPID:rpID,credential,requireUserVerification:true});
  if(!auth.verified)throw Error('assertion verification failed');
  let rejectedOrigin=false;
  try {await verifyAuthenticationResponse({response:assertion,expectedChallenge:authOpts.challenge,expectedOrigin:'http://evil.localhost:8799',expectedRPID:rpID,credential,requireUserVerification:true});}catch{rejectedOrigin=true;}
  if(!rejectedOrigin)throw Error('wrong origin was accepted');
  let rejectedChallenge=false;
  try {await verifyAuthenticationResponse({response:assertion,expectedChallenge:'wrongchallenge',expectedOrigin:origin,expectedRPID:rpID,credential,requireUserVerification:true});}catch{rejectedChallenge=true;}
  if(!rejectedChallenge)throw Error('wrong challenge was accepted');
  return {ok:true,checks:{registration:true,discoverableOptions:true,authentication:true,rejectWrongOrigin:true,rejectWrongChallenge:true},runtime:'wrangler dev --local (workerd)',realDevice:false,realCloudflareEdge:false};
}


async function runD1(db) {
  // Local-only simplified fixture: not the application's invitations tables.
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS s0_invites(id TEXT PRIMARY KEY, player_id TEXT NOT NULL, used_by TEXT, revoked INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS s0_links(player_id TEXT PRIMARY KEY, user_id TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS s0_users(id TEXT PRIMARY KEY)'),
    db.prepare('CREATE TABLE IF NOT EXISTS s0_passkeys(id TEXT PRIMARY KEY, user_id TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS s0_claims(invite_id TEXT PRIMARY KEY, user_id TEXT NOT NULL)'),
  ]);
  await db.prepare('CREATE TRIGGER IF NOT EXISTS s0_claim_guard BEFORE INSERT ON s0_claims BEGIN SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM s0_invites i JOIN s0_links l ON i.player_id=l.player_id WHERE i.id=NEW.invite_id AND i.used_by IS NULL AND i.revoked=0 AND l.user_id IS NULL) THEN RAISE(ABORT,\'invite_unavailable\') END; END').run();
  const unique=()=>crypto.randomUUID();
  const row=async (sql,...values) => db.prepare(sql).bind(...values).first();
  const seed=async (id,player,revoked=0) => db.batch([
    db.prepare('INSERT INTO s0_invites(id,player_id,revoked) VALUES(?,?,?)').bind(id,player,revoked),
    db.prepare('INSERT INTO s0_links(player_id,user_id) VALUES(?,NULL)').bind(player),
  ]);
  const redeem=async (id,player,user,credential) => db.batch([
    db.prepare('INSERT INTO s0_users(id) VALUES(?)').bind(user),
    db.prepare('INSERT INTO s0_passkeys(id,user_id) VALUES(?,?)').bind(credential,user),
    db.prepare('INSERT INTO s0_claims(invite_id,user_id) VALUES(?,?)').bind(id,user),
    db.prepare('UPDATE s0_invites SET used_by=? WHERE id=? AND used_by IS NULL AND revoked=0').bind(user,id),
    db.prepare('UPDATE s0_links SET user_id=? WHERE player_id=? AND user_id IS NULL').bind(user,player),
  ]);
  const check=(value,name)=>{if(!value)throw Error(name);};
  const a=[unique(),unique(),unique(),unique()];await seed(a[0],a[1]);await redeem(a[0],a[1],a[2],a[3]);
  const happy=Boolean((await row('SELECT used_by FROM s0_invites WHERE id=?',a[0]))?.used_by===a[2] && (await row('SELECT user_id FROM s0_links WHERE player_id=?',a[1]))?.user_id===a[2]);
  check(happy,'happy path incomplete');
  const replayUser=unique(),replayCredential=unique();
  let replayRejected=false;try{await redeem(a[0],a[1],replayUser,replayCredential);}catch{replayRejected=true;}
  const replayRolledBack=!(await row('SELECT id FROM s0_users WHERE id=?',replayUser)) && !(await row('SELECT id FROM s0_passkeys WHERE id=?',replayCredential));
  check(replayRejected && replayRolledBack,'replay rollback');
  const concurrentInvite=unique(),concurrentPlayer=unique(),concurrentUsers=[unique(),unique()],concurrentCredentials=[unique(),unique()];
  await seed(concurrentInvite,concurrentPlayer);
  const both=await Promise.allSettled(concurrentUsers.map((user,i)=>redeem(concurrentInvite,concurrentPlayer,user,concurrentCredentials[i])));
  const accepted=both.filter(x=>x.status==='fulfilled').length;
  const concurrentExactlyOne=accepted===1 && Number((await row('SELECT COUNT(*) AS count FROM s0_claims WHERE invite_id=?',concurrentInvite)).count)===1;
  const concurrentNoOrphans=(await Promise.all(concurrentUsers.map(user=>row('SELECT COUNT(*) AS count FROM s0_users WHERE id=?',user)))).reduce((sum,r)=>sum+Number(r.count),0)===1;
  check(concurrentExactlyOne && concurrentNoOrphans,'concurrent duplicate claim');
  const revokedInvite=unique(),revokedPlayer=unique(),revokedUser=unique(),revokedCredential=unique();await seed(revokedInvite,revokedPlayer,1);
  let revokedRejected=false;try{await redeem(revokedInvite,revokedPlayer,revokedUser,revokedCredential);}catch{revokedRejected=true;}
  const revokedRolledBack=!(await row('SELECT id FROM s0_users WHERE id=?',revokedUser));check(revokedRejected && revokedRolledBack,'revoked invite');
  const collisionInvite=unique(),collisionPlayer=unique(),collisionUser=unique();await seed(collisionInvite,collisionPlayer);
  let collisionRejected=false;try{await redeem(collisionInvite,collisionPlayer,collisionUser,a[3]);}catch{collisionRejected=true;}
  const collisionRolledBack=!(await row('SELECT id FROM s0_users WHERE id=?',collisionUser)) && (await row('SELECT used_by FROM s0_invites WHERE id=?',collisionInvite))?.used_by===null;
  check(collisionRejected && collisionRolledBack,'passkey uniqueness rollback');
  // Explicit demonstration: an UPDATE with zero matching rows does NOT abort a preceding INSERT.
  const zeroUser=unique();const zeroResults=await db.batch([
    db.prepare('INSERT INTO s0_users(id) VALUES(?)').bind(zeroUser),
    db.prepare('UPDATE s0_invites SET used_by=? WHERE id=?').bind(zeroUser,'nonexistent-'+unique()),
  ]);
  const zeroChangesCommitted=Number(zeroResults[1].meta.changes)===0 && Boolean(await row('SELECT id FROM s0_users WHERE id=?',zeroUser));
  await db.prepare('DELETE FROM s0_users WHERE id=?').bind(zeroUser).run();check(zeroChangesCommitted,'expected zero-change commit');
  return {ok:true,checks:{happy,replayRejected,replayRolledBack,concurrentExactlyOne,concurrentNoOrphans,revokedRejected,revokedRolledBack,collisionRejected,collisionRolledBack,zeroChangesCommitted},fixture:'local isolated D1 only',realCloudflareD1:false};
}


async function runExistingSchema(db) {
  // S0 only: exact EXISTING schema, loaded by unchanged migrations/0001..0010.
  // Redemption statements are a snapshot of main/src/worker/auth/line-login.ts.
  // This does NOT execute that application handler or include new Passkey storage.
  const now = new Date().toISOString();
  const future = new Date(Date.now()+7*86400_000).toISOString();
  const uuid = () => crypto.randomUUID();
  const one = (sql,...params) => db.prepare(sql).bind(...params).first();
  const count = async (sql,...params) => Number((await one(sql,...params))?.n??0);
  const demand = (condition,description) => {if(!condition)throw Error(description);};
  let attempt=0;
  async function scenario({revoked=false,linkedUser=null,secondPlayer=false}={}) {
    const groupId=uuid(),playerId=uuid(),invitationId=uuid(),administrator=uuid(),userA=uuid(),userB=uuid();
    await db.batch([
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(administrator,"Test Admin",now,now),
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(userA,"User A",now,now),
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(userB,"User B",now,now),
      db.prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(groupId,"S0 isolated",now,now),
      db.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(playerId,"Player A",now,now),
      db.prepare("INSERT INTO group_players(group_id,player_id,active,user_id) VALUES(?,?,1,?)").bind(groupId,playerId,linkedUser=== "userB" ? userB:null),
      db.prepare("INSERT INTO invitations(id,token_hash,group_id,player_id,role,created_by_user_id,expires_at,revoked_at,created_at) VALUES(?,?,?,?,'member',?,?,?,?)").bind(invitationId,uuid(),groupId,playerId,administrator,future,revoked?now:null,now)
    ]);
    if(secondPlayer){
      const anotherPlayer=uuid();
      await db.batch([
        db.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(anotherPlayer,"Player B",now,now),
        db.prepare("INSERT INTO group_players(group_id,player_id,user_id) VALUES(?,?,?)").bind(groupId,anotherPlayer,userA)
      ]);
    }
    return {groupId,playerId,invitationId,administrator,userA,userB};
  }
  async function redeem(invitationId,userId) {
    attempt++;
    const instant = new Date().toISOString();
    const invite=await one("SELECT id,group_id AS groupId,player_id AS playerId,expires_at AS expiresAt FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?",invitationId,instant);
    if(!invite)return "invalid";
    const existingLink=await one("SELECT player_id AS playerId FROM group_players WHERE group_id=? AND user_id=?",invite.groupId,userId);
    if(existingLink&&existingLink.playerId!==invite.playerId)return "conflict";
    const target=await one("SELECT active,user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",invite.groupId,invite.playerId);
    if(!target||target.active!==1||(target.userId&&target.userId!==userId))return "conflict";
    try {
      const result=await db.batch([
        db.prepare("UPDATE group_players SET user_id=? WHERE group_id=? AND player_id=? AND active=1 AND (user_id IS NULL OR user_id=?) AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?)").bind(userId,invite.groupId,invite.playerId,userId,invite.id,instant),
        db.prepare("INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) SELECT ?,?,'member',?,? WHERE EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND user_id=?) AND EXISTS(SELECT 1 FROM invitations WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?) ON CONFLICT(group_id,user_id) DO UPDATE SET role=CASE WHEN group_memberships.role='group_admin' THEN 'group_admin' ELSE 'member' END,updated_at=excluded.updated_at").bind(invite.groupId,userId,instant,instant,invite.groupId,invite.playerId,userId,invite.id,instant),
        db.prepare("UPDATE invitations SET used_at=?,used_by_user_id=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM group_players WHERE group_id=? AND player_id=? AND user_id=?)").bind(instant,userId,invite.id,instant,invite.groupId,invite.playerId,userId)
      ]);
      return result.some(v=>v.meta.changes!==1) ? "conflict":"accepted";
    } catch {return "conflict";}
  }
  const results={};
  const good=await scenario();
  results.normalAccepted=(await redeem(good.invitationId,good.userA))==="accepted";
  results.normalLinked=(await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",good.groupId,good.playerId))?.userId===good.userA;
  results.normalMembership=(await one("SELECT role FROM group_memberships WHERE group_id=? AND user_id=?",good.groupId,good.userA))?.role==="member";
  results.normalUsedBy=(await one("SELECT used_by_user_id AS userId FROM invitations WHERE id=?",good.invitationId))?.userId===good.userA;
  results.sameInviteReplayRejected=(await redeem(good.invitationId,good.userB))==="invalid";
  results.sameInviteNoOtherMembership=(await count("SELECT COUNT(*) AS n FROM group_memberships WHERE group_id=? AND user_id=?",good.groupId,good.userB))===0;
  const revoked=await scenario({revoked:true});
  results.revokedRejected=(await redeem(revoked.invitationId,revoked.userA))==="invalid";
  results.revokedPlayerUnlinked=(await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",revoked.groupId,revoked.playerId))?.userId===null;
  const prelinked=await scenario({linkedUser:"userB"});
  results.otherUserPrelinkedRejected=(await redeem(prelinked.invitationId,prelinked.userA))==="conflict";
  results.otherUserStillLinked=(await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",prelinked.groupId,prelinked.playerId))?.userId===prelinked.userB;
  const sameGroupTwoPlayer=await scenario({secondPlayer:true});
  results.userAlreadyLinkedRejected=(await redeem(sameGroupTwoPlayer.invitationId,sameGroupTwoPlayer.userA))==="conflict";
  results.userAlreadyLinkedTargetUnchanged=(await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",sameGroupTwoPlayer.groupId,sameGroupTwoPlayer.playerId))?.userId===null;
  const race=await scenario();
  const raceResults=await Promise.all([redeem(race.invitationId,race.userA),redeem(race.invitationId,race.userB)]);
  const accepted=raceResults.filter(v=>v==="accepted").length;
  const racePlayer=await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",race.groupId,race.playerId);
  const raceInvite=await one("SELECT used_by_user_id AS userId FROM invitations WHERE id=?",race.invitationId);
  results.raceOneWinner=accepted===1;
  results.raceLinkAndInviteAgree=Boolean(racePlayer?.userId)&&racePlayer.userId===raceInvite?.userId;
  results.raceOnlyWinnerMembership=(await count("SELECT COUNT(*) AS n FROM group_memberships WHERE group_id=?",race.groupId))===1;
  const existingUserUninvited=uuid(),otherGroup=uuid(),otherPlayer=uuid();
  // Simulate the existing admin "existing User -> Player" mapping: no new Credential is necessary.
  await db.batch([
    db.prepare("INSERT INTO users(id,created_at,updated_at) VALUES(?,?,?)").bind(existingUserUninvited,now,now),
    db.prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(otherGroup,"Second group",now,now),
    db.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(otherPlayer,"Same person",now,now),
    db.prepare("INSERT INTO group_players(group_id,player_id,user_id) VALUES(?,?,?)").bind(otherGroup,otherPlayer,existingUserUninvited)
  ]);
  results.existingUserLinkIndependent=(await one("SELECT user_id AS userId FROM group_players WHERE group_id=? AND player_id=?",otherGroup,otherPlayer))?.userId===existingUserUninvited;
  demand(Object.values(results).every(Boolean),"existing-schema fixture failure: "+JSON.stringify(results));
  return {ok:true,checks:results,count:Object.keys(results).length,source:"migrations/0001..0010 and main LINE redemption SQL snapshot",testOnly:true,realProductionD1:false,applicationHandlerCalled:false,attempts:attempt};
}


async function runActualInvitationHandler(db) {
  // S0: Use the CURRENT APPLICATION HANDLER, not the test's SQL duplication.
  // Isolated local D1 with migrations/0001-0010 only; no passkey table / credential.
  const now=new Date().toISOString();
  const expires=new Date(Date.now()+86400000).toISOString();
  const id=()=>crypto.randomUUID();
  const one=(sql,...args)=>db.prepare(sql).bind(...args).first();
  const num=async(sql,...args)=>Number((await one(sql,...args))?.n??0);
  const checks={};
  const env={DB:db};
  async function fixture({revoked=false,linkedToB=false,previousA=false,groupAdminA=false}={}) {
    const groupId=id(),playerId=id(),inviteId=id(),admin=id(),a=id(),b=id();
    await db.batch([
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(admin,'Admin',now,now),
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(a,'A',now,now),
      db.prepare("INSERT INTO users(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(b,'B',now,now),
      db.prepare("INSERT INTO groups(id,name,created_at,updated_at) VALUES(?,?,?,?)").bind(groupId,'Real handler S0',now,now),
      db.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(playerId,'Player',now,now),
      db.prepare("INSERT INTO group_players(group_id,player_id,active,user_id) VALUES(?,?,1,?)").bind(groupId,playerId,linkedToB?b:null),
      db.prepare("INSERT INTO invitations(id,token_hash,group_id,player_id,role,created_by_user_id,expires_at,revoked_at,created_at) VALUES(?,?,?,?,'member',?,?,?,?)").bind(inviteId,id(),groupId,playerId,admin,expires,revoked?now:null,now),
    ]);
    if(previousA) {
      const otherPlayer=id();
      await db.batch([
        db.prepare("INSERT INTO players(id,display_name,created_at,updated_at) VALUES(?,?,?,?)").bind(otherPlayer,'Already linked',now,now),
        db.prepare("INSERT INTO group_players(group_id,player_id,active,user_id) VALUES(?,?,1,?)").bind(groupId,otherPlayer,a),
      ]);
    }
    if(groupAdminA) await db.prepare("INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at) VALUES(?,?,'group_admin',?,?)").bind(groupId,a,now,now).run();
    return {groupId,playerId,inviteId,a,b};
  }
  const normal=await fixture();
  checks.normalAccept=(await redeemInvitationById(env,normal.inviteId,normal.a))==='accepted';
  checks.playerLinked=(await one("SELECT user_id AS u FROM group_players WHERE group_id=? AND player_id=?",normal.groupId,normal.playerId))?.u===normal.a;
  checks.membershipCreated=(await one("SELECT role FROM group_memberships WHERE group_id=? AND user_id=?",normal.groupId,normal.a))?.role==='member';
  checks.invitationConsumed=(await one("SELECT used_by_user_id AS u FROM invitations WHERE id=?",normal.inviteId))?.u===normal.a;
  checks.replayInvalid=(await redeemInvitationById(env,normal.inviteId,normal.b))==='invalid';
  checks.replayMembershipNotCreated=(await num("SELECT count(*) AS n FROM group_memberships WHERE group_id=? AND user_id=?",normal.groupId,normal.b))===0;
  const revoked=await fixture({revoked:true});
  checks.revokedInvalid=(await redeemInvitationById(env,revoked.inviteId,revoked.a))==='invalid';
  checks.revokedUnlinked=(await one("SELECT user_id AS u FROM group_players WHERE group_id=? AND player_id=?",revoked.groupId,revoked.playerId))?.u===null;
  const prelinked=await fixture({linkedToB:true});
  checks.prelinkedConflict=(await redeemInvitationById(env,prelinked.inviteId,prelinked.a))==='conflict';
  checks.prelinkedPreserved=(await one("SELECT user_id AS u FROM group_players WHERE group_id=? AND player_id=?",prelinked.groupId,prelinked.playerId))?.u===prelinked.b;
  const busy=await fixture({previousA:true});
  checks.sameGroupUserConflict=(await redeemInvitationById(env,busy.inviteId,busy.a))==='conflict';
  checks.busyUnlinked=(await one("SELECT user_id AS u FROM group_players WHERE group_id=? AND player_id=?",busy.groupId,busy.playerId))?.u===null;
  const existingAdmin=await fixture({groupAdminA:true});
  checks.adminAccepted=(await redeemInvitationById(env,existingAdmin.inviteId,existingAdmin.a))==='accepted';
  checks.groupAdminRetained=(await one("SELECT role FROM group_memberships WHERE group_id=? AND user_id=?",existingAdmin.groupId,existingAdmin.a))?.role==='group_admin';
  const race=await fixture();
  const raceResponses=await Promise.all([redeemInvitationById(env,race.inviteId,race.a),redeemInvitationById(env,race.inviteId,race.b)]);
  checks.raceExactlyOneAccepted=raceResponses.filter(x=>x==='accepted').length===1;
  checks.raceExactlyOneConflict=raceResponses.filter(x=>x==='conflict').length===1;
  const linked=await one("SELECT user_id AS u FROM group_players WHERE group_id=? AND player_id=?",race.groupId,race.playerId);
  const consumed=await one("SELECT used_by_user_id AS u FROM invitations WHERE id=?",race.inviteId);
  checks.raceSameUser=Boolean(linked?.u)&&linked.u===consumed?.u;
  checks.raceOneMembership=(await num("SELECT count(*) AS n FROM group_memberships WHERE group_id=?",race.groupId))===1;
  if(Object.values(checks).some(x=>x!==true))throw Error("Actual invitation handler integration failed: "+JSON.stringify(checks));
  return {ok:true,count:Object.keys(checks).length,checks,source:"src/worker/auth/line-login.ts::redeemInvitationById",actualApplicationHandlerCalled:true,passkeyRegistrationImplemented:false,realProductionD1:false,realDevice:false};
}

export default {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if(path==='/health')return Response.json({ready:true});
    if(path==='/actual-handler-probe'){try{return Response.json(await runActualInvitationHandler(env.DB),{headers:{'cache-control':'no-store'}});}catch(error){console.error('S0 actual handler integration failed',error);return Response.json({ok:false,error:String(error)},{status:500});}}
    if(path==='/existing-schema-probe'){try{return Response.json(await runExistingSchema(env.DB),{headers:{'cache-control':'no-store'}});}catch(error){console.error('S0 current-schema probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}}
    if(path==='/db-probe'){try{return Response.json(await runD1(env.DB),{headers:{'cache-control':'no-store'}});}catch(error){console.error('S0 D1 probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}}
    if(path!=='/probe')return new Response('not found',{status:404});
    try{return Response.json(await run(),{headers:{'cache-control':'no-store'}});}
    catch(error){console.error('S0 probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}
  },
};
