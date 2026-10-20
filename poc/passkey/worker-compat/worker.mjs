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

export default {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if(path==='/health')return Response.json({ready:true});
    if(path!=='/probe')return new Response('not found',{status:404});
    try{return Response.json(await run(),{headers:{'cache-control':'no-store'}});}
    catch(error){console.error('S0 probe failed',error);return Response.json({ok:false,error:String(error)},{status:500});}
  },
};
