/**
 * Phase 4 S0: real Chromium browser API with DevTools virtual passkey.
 * Real navigator.credentials.create()/get(), but NO physical phone/security key.
 * Works exclusively against local workerd + fabricated D1 fixture.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base='http://localhost:8799';
const browser=await chromium.launch({headless:true});
let passed=0;
const record=(name,value)=>{assert.ok(value,name);console.log('PASS',name);passed++;};
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable',{enableUI:false});
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{
    options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}
  });
  const fixtureRes=await context.request.post(base+'/api/fixture',{data:{}});
  assert.equal(fixtureRes.status(),200);
  const fixture=await fixtureRes.json();
  record('Synthetic admin invitation issued',fixture.ok&&typeof fixture.invite==='string');
  await page.goto(base+'/');
  const env=await page.evaluate(()=>({secureContext:isSecureContext,credentials:!!navigator.credentials,create:typeof navigator.credentials?.create,get:typeof navigator.credentials?.get}));
  record('Browser secure context with native WebAuthn',env.secureContext&&env.credentials&&env.create==='function'&&env.get==='function');
  await page.locator('#invite').fill(fixture.invite);
  await page.getByRole('button',{name:'Register'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"sessionIssued":false'),null,{timeout:15000});
  const reg=JSON.parse(await page.locator('#status').textContent());
  record('Browser-created credential accepted by real SimpleWebAuthn',reg.ok===true&&reg.sessionIssued===false&&typeof reg.userId==='string');
  const credentialCount=await cdp.send('WebAuthn.getCredentials',{authenticatorId});
  record('Virtual CTAP2 authenticator stores one credential',credentialCount.credentials?.length===1);
  const reused=await context.request.post(base+'/api/register/verify',{data:await page.evaluate(()=>window.lastRegistration)});
  record('Browser registration challenge replay rejected',reused.status()===409);
  const duplicate=await context.request.post(base+'/api/register/options',{data:{invite:fixture.invite}});
  record('Consumed invitation cannot start a new registration',duplicate.status()===409);
  await page.getByRole('button',{name:'Login'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"sessionIssued":false')&&!document.querySelector('#status')?.textContent?.includes('"credentialId"'),null,{timeout:15000});
  const login=JSON.parse(await page.locator('#status').textContent());
  record('Browser-native resident-passkey login resolves original User',login.ok===true&&login.userId===reg.userId);
  const loginPayload=await page.evaluate(()=>window.lastAuthentication);
  const replay=await context.request.post(base+'/api/login/verify',{data:loginPayload});
  record('Authentication challenge replay rejected',replay.status()===409);
  const newOptionsRes=await context.request.post(base+'/api/login/options',{data:{}});
  const newOptions=await newOptionsRes.json();
  const wrong=await context.request.post(base+'/api/login/verify',{data:{requestId:newOptions.requestId,credential:loginPayload.credential}});
  record('Old browser signature cannot satisfy new challenge',wrong.status()===400);
  const fake={...loginPayload,requestId:newOptions.requestId,credential:{...loginPayload.credential,id:'unknown-credential-id'}};
  const unknown=await context.request.post(base+'/api/login/verify',{data:fake});
  record('Unknown passkey cannot sign in',unknown.status()===400);
  const invite2=(await (await context.request.post(base+'/api/fixture',{data:{}})).json()).invite;
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  const uvFailed=await page.evaluate(async invite=>{
    try { await window.s0Browser.register(invite);return false;}
    catch {return true;}
  },invite2);
  record('User verification required for new passkey',uvFailed);
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  console.log(JSON.stringify({ok:true,checks:passed,usedNativeBrowserWebAuthn:true,usedVirtualAuthenticator:true,physicalAuthenticator:false,realCloudflareEdge:false,productionAccountOrSession:false,origin:base,library:'@simplewebauthn/server@14.0.3'}));
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
  await context.close();
} finally {
  await browser.close();
}
