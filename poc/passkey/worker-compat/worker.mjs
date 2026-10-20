import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

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

export default {
  async fetch(request,env) {
    const path = new URL(request.url).pathname;
    if(path==='/health')return Response.json({ready:true});
    if(path==='/db-probe'){try{return Response.json(await runD1(env.DB),{headers:{'cache-control':'no-store'}});}catch(error){console.error('S0 D1 probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}}
    if(path!=='/probe')return new Response('not found',{status:404});
    try{return Response.json(await run(),{headers:{'cache-control':'no-store'}});}
    catch(error){console.error('S0 probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}
  },
};
