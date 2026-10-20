/**
 * Phase 4 / S0 experiment only. This is NOT a WebAuthn library or production verifier.
 * Uses Node 22's Web Crypto implementation to exercise ES256 assertion mechanics.
 * No real authenticator, Cloudflare Worker, D1, or browser is involved.
 */
import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';

const enc = new TextEncoder();
const toBytes = (value) => value instanceof Uint8Array ? value : new Uint8Array(value);
const concat = (...chunks) => { const b = chunks.map(toBytes); const out = new Uint8Array(b.reduce((s,x)=>s+x.length,0)); let i=0; for (const x of b) {out.set(x,i);i+=x.length;} return out; };
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const sha256 = async (b) => toBytes(await crypto.subtle.digest('SHA-256', b));
const equal = (a,b) => a.length===b.length && a.every((value,i)=>value===b[i]);

// Authenticators return ASN.1 DER ECDSA signatures; WebCrypto P-256 verify() uses raw r||s.
// This tiny decoder is intentionally limited to DER SEQUENCE(INTEGER r, INTEGER s) of P-256.
function derToRawP256(der) {
  let p=0;
  const take=()=>{if(p>=der.length)throw Error('DER truncated');return der[p++];};
  if(take()!==0x30)throw Error('DER SEQUENCE expected');
  const len=take();if(len&0x80||len!==der.length-2)throw Error('Invalid DER length');
  const integer=()=>{
    if(take()!==0x02)throw Error('DER INTEGER expected');
    const n=take();if(n<1||n>33||p+n>der.length)throw Error('Invalid integer length');
    let bytes=der.subarray(p,p+n);p+=n;
    if(bytes.length===33){if(bytes[0]!==0)throw Error('Invalid INTEGER padding');bytes=bytes.subarray(1);}
    if(bytes.length>32)throw Error('Oversized INTEGER');
    const out=new Uint8Array(32);out.set(bytes,32-bytes.length);return out;
  };
  const r=integer(),s=integer();if(p!==der.length)throw Error('Unexpected DER trailing bytes');
  return concat(r,s);
}
function rawToDerP256(raw) {
  const integer=(piece)=>{
    let p=0;while(p<piece.length-1&&piece[p]===0)p++;
    let x=piece.subarray(p);if(x[0]&0x80)x=concat(Uint8Array.of(0),x);
    return concat(Uint8Array.of(0x02,x.length),x);
  };
  const body=concat(integer(raw.subarray(0,32)),integer(raw.subarray(32,64)));
  return concat(Uint8Array.of(0x30,body.length),body);
}
const origin='https://mahjong-score.example.test';
const rpID='mahjong-score.example.test';
const credentialID=b64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge=b64url(crypto.getRandomValues(new Uint8Array(32)));
const keypair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('spki',keypair.publicKey);

async function makeAssertion({challengeValue=challenge,originValue=origin,rp=rpID,flags=0x05,tamper=false}={}) {
  const authenticatorData=concat(await sha256(enc.encode(rp)),Uint8Array.of(flags,0,0,0,1));
  const clientDataJSON=enc.encode(JSON.stringify({type:'webauthn.get',challenge:challengeValue,origin:originValue}));
  const signedData=concat(authenticatorData,await sha256(clientDataJSON));
  const signed=toBytes(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keypair.privateKey,signedData));
  const signature=rawToDerP256(signed);
  if(tamper)signature[signature.length-1]^=1;
  return {credentialID,clientDataJSON,authenticatorData,signature};
}
async function verifyAssertion(assertion,{expectedChallenge=challenge,expectedOrigin=origin,expectedRPID=rpID,knownCredentialID=credentialID}={}) {
  try {
    if(assertion.credentialID!==knownCredentialID)return false;
    const c=JSON.parse(new TextDecoder().decode(assertion.clientDataJSON));
    if(c.type!=='webauthn.get'||c.challenge!==expectedChallenge||c.origin!==expectedOrigin)return false;
    const ad=assertion.authenticatorData;
    if(ad.length<37||!equal(ad.subarray(0,32),await sha256(enc.encode(expectedRPID))))return false;
    if((ad[32]&0x01)===0||(ad[32]&0x04)===0)return false; // UP + UV
    const signedData=concat(ad,await sha256(assertion.clientDataJSON));
    const imported=await crypto.subtle.importKey('spki',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,derToRawP256(assertion.signature),signedData);
  } catch {return false;}
}
const good=await makeAssertion();
const cases=[
  ['ES256 signature valid',await verifyAssertion(good),true],
  ['challenge mismatch',await verifyAssertion(good,{expectedChallenge:b64url(crypto.getRandomValues(new Uint8Array(32)))}),false],
  ['origin mismatch',await verifyAssertion(good,{expectedOrigin:'https://evil.example.test'}),false],
  ['RP ID mismatch',await verifyAssertion(good,{expectedRPID:'other.example.test'}),false],
  ['UV not present',await verifyAssertion(await makeAssertion({flags:0x01})),false],
  ['UP not present',await verifyAssertion(await makeAssertion({flags:0x04})),false],
  ['signature tampered',await verifyAssertion(await makeAssertion({tamper:true})),false],
  ['unknown credential',await verifyAssertion(good,{knownCredentialID:'other-credential'}),false],
];
const spent=new Set();
async function verifyOnce(a) {if(spent.has(challenge))return false;const ok=await verifyAssertion(a);if(ok)spent.add(challenge);return ok;}
cases.push(['first one-time challenge',await verifyOnce(good),true]);
cases.push(['same challenge replay',await verifyOnce(good),false]);
let passed=0;
for(const [name,result,expected] of cases) {assert.equal(result,expected,name);passed++; console.log('PASS',name);}
console.log(`S0 local cryptographic probe: ${passed}/${cases.length} passed`);
console.log('LIMIT: Node Web Crypto + synthetic signatures only; Workers, D1, browser, SimpleWebAuthn library NOT tested.');
