// S0 automated check for the future physical-phone compatibility page.
// Chromium browser + CDP VIRTUAL authenticator only. Not an iPhone/Android test.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base='http://localhost:8799';
const browser=await chromium.launch({headless:true});
let passed=0;
function ok(name,condition){assert.equal(Boolean(condition),true,name);passed++;console.log('PASS '+name);}
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable',{enableUI:false});
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true
  }});
  const visit=await page.goto(base+'/');
  ok('Page renders without server binding',visit.status()===200);
  ok('No-index and frame protection',visit.headers()['x-robots-tag']?.includes('noindex')&&visit.headers()['x-frame-options']==='DENY');
  ok('No-network CSP is set',visit.headers()['content-security-policy']?.includes("connect-src 'none'"));
  const env=JSON.parse(await page.locator('#environment').textContent());
  ok('Secure localhost context and native WebAuthn',env.secureContext&&env.webauthnCreate&&env.webauthnGet&&env.rpID==='localhost');
  await page.getByRole('button',{name:'1. パスキーを作成'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"state": "PASS"'),null,{timeout:20000});
  const created=JSON.parse(await page.locator('#status').textContent());
  ok('Browser-only credential creation works',created.state==='PASS'&&created.operation==='create'&&created.serverVerified===false);
  ok('Virtual authenticator holds a credential',(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length===1);
  await page.getByRole('button',{name:'2. パスキーを使用'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"operation": "get"')&&document.querySelector('#status')?.textContent?.includes('"state": "PASS"'),null,{timeout:20000});
  const used=JSON.parse(await page.locator('#status').textContent());
  ok('Browser-only get matches credential and verifies RP+UV flags',used.credentialMatched&&used.userVerification&&used.signaturePresent&&!used.serverVerified);
  // Two valid credentials for the SAME RP: an empty allowCredentials list
  // could have silently selected the wrong passkey. Verify that the requested
  // registered credential is the only acceptable one.
  const savedFirst=await page.evaluate(()=>localStorage.getItem('mahjong-passkey-s0-test-credential-id'));
  await page.getByRole('button',{name:'1. パスキーを作成'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"operation": "create"')&&document.querySelector('#status')?.textContent?.includes('"state": "PASS"'),null,{timeout:20000});
  const savedSecond=await page.evaluate(()=>localStorage.getItem('mahjong-passkey-s0-test-credential-id'));
  ok('Browser can hold two distinct discoverable credentials for same RP',
    savedFirst!==savedSecond && (await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials.length===2);
  await page.evaluate(id=>localStorage.setItem('mahjong-passkey-s0-test-credential-id',id),savedFirst);
  await page.getByRole('button',{name:'2. パスキーを使用'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"operation": "get"')&&document.querySelector('#status')?.textContent?.includes('"state": "PASS"'),null,{timeout:20000});
  const selected=JSON.parse(await page.locator('#status').textContent());
  ok('allowCredentials selects first registered credential even if second exists',
    selected.state==='PASS'&&selected.credentialMatched===true&&selected.userVerification===true);
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:false});
  await page.getByRole('button',{name:'2. パスキーを使用'}).click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"state": "FAIL"'),null,{timeout:10000});
  const rejected=JSON.parse(await page.locator('#status').textContent());
  ok('User verification disabled is rejected',rejected.state==='FAIL');
  await cdp.send('WebAuthn.setUserVerified',{authenticatorId,isUserVerified:true});
  await page.getByRole('button',{name:'端末内のテスト記録だけを削除'}).click();
  const cleared=JSON.parse(await page.locator('#status').textContent());
  ok('Local record reset warns device passkey persists',cleared.state==='CLEARED_LOCAL_RECORD'&&cleared.passkeyStillOnDevice===true);
  const health=await context.request.get(base+'/health');
  const h=await health.json();
  ok('Health endpoint declares no DB/no user data',h.ok&&h.noDatabase&&h.noUserData);
  const rejectedPost=await context.request.post(base+'/');
  ok('No mutable API',rejectedPost.status()===405);
  // Separate S0-only server crypto path: real browser WebAuthn -> local workerd
  // SimpleWebAuthn server verifier, with ephemeral one-shot challenge state.
  const captured={};
  page.on('request',req=>{
    if(req.url().endsWith('/s0-server/auth/verify'))captured.auth=req.postDataJSON();
    if(req.url().endsWith('/s0-server/register/verify'))captured.registration=req.postDataJSON();
  });
  const serverPage=await page.goto(base+'/server-check');
  ok('Isolated server-side WebAuthn page loads with same-origin API CSP',
    serverPage.status()===200&&serverPage.headers()['content-security-policy'].includes("connect-src 'self'"));
  await page.locator('#register').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"registrationVerified": true'),null,{timeout:20000});
  const regVerified=JSON.parse(await page.locator('#status').textContent());
  ok('Real server verifies browser attestation challenge origin RP and UV',
    regVerified.state==='PASS'&&regVerified.serverVerified===true&&regVerified.sessionIssued===false);
  const badReg=await context.request.post(base+'/s0-server/register/verify',{data:captured.registration});
  ok('Server rejects reused registration challenge',badReg.status()===409);
  await page.locator('#auth').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('"signatureVerified": true'),null,{timeout:20000});
  const signature=JSON.parse(await page.locator('#status').textContent());
  ok('Real server verifies WebAuthn authentication signature',
    signature.state==='PASS'&&signature.serverVerified===true&&signature.signatureVerified===true&&signature.rpIdMatched===true&&signature.sessionIssued===false);
  const replayAuth=await context.request.post(base+'/s0-server/auth/verify',{data:captured.auth});
  ok('Server rejects reused authentication challenge',replayAuth.status()===409);
  const fakeFlow=await context.request.post(base+'/s0-server/auth/options',{data:{flowId:'00000000-0000-4000-8000-000000000000'}});
  ok('Unknown or expired server state fails closed',fakeFlow.status()===409);
  const noPost=await context.request.get(base+'/s0-server/register/options');
  ok('No credential APIs accept GET methods',noPost.status()===405);
  console.log(JSON.stringify({ok:true,checks:passed,origin:base,virtualAuthenticator:true,physicalPhone:false,remotePreviewDeployed:false,productionData:false}));
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
  await context.close();
} finally {
  await browser.close();
}
