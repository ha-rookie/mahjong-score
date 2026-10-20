// Real Cloudflare Edge HTTPS Worker + actual Chromium WebAuthn API + CDP virtual FIDO2.
// NO physical smartphone: independently validates Edge's SimpleWebAuthn crypto path.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root='https://s0-phone-check-337-mahjong-score-passkey-s0-phone-337.ha-rookie.workers.dev';
const browser=await chromium.launch({headless:true});
let checks=0;
const ok=(title,value)=>{assert.ok(value,title);checks++;console.log('PASS',title);};
try{
  const context=await browser.newContext();
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable',{enableUI:false});
  const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{
    options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}
  });
  const captured={};
  page.on('request',request=>{
    if(request.url().endsWith('/s0-server/register/verify'))captured.reg=request.postDataJSON();
    if(request.url().endsWith('/s0-server/auth/verify'))captured.auth=request.postDataJSON();
  });
  const response=await page.goto(root+'/server-check',{waitUntil:'domcontentloaded',timeout:25000});
  ok('Remote Cloudflare Edge server probe HTML loads',response.status()===200);
  const pageCsp=response.headers()['content-security-policy']||'';
  ok('Real HTTPS Origin and same-origin-only API CSP',new URL(page.url()).protocol==='https:'&&pageCsp.includes("connect-src 'self'"));
  await page.locator('#register').click();
  await page.waitForFunction(()=>{
    const t=document.querySelector('#status')?.textContent||'';
    return t.includes('"state": "PASS"')||t.includes('"state": "FAIL"');
  },null,{timeout:30000});
  const reg=JSON.parse(await page.locator('#status').textContent());
  ok('Edge SimpleWebAuthn validates browser registration',reg.state==='PASS'&&reg.registrationVerified===true&&reg.serverVerified===true&&reg.sessionIssued===false);
  const replayReg=await context.request.post(root+'/s0-server/register/verify',{data:captured.reg});
  ok('Remote registration challenge replay refused',replayReg.status()===409);
  await page.locator('#auth').click();
  await page.waitForFunction(()=>{
    const t=document.querySelector('#status')?.textContent||'';
    return t.includes('"state": "PASS"')||t.includes('"state": "FAIL"');
  },null,{timeout:30000});
  const auth=JSON.parse(await page.locator('#status').textContent());
  ok('Edge cryptographically verifies WebAuthn login signature',
    auth.state==='PASS'&&auth.serverVerified===true&&auth.signatureVerified===true&&auth.userVerified===true&&auth.rpIdMatched===true&&auth.sessionIssued===false);
  const replayAuth=await context.request.post(root+'/s0-server/auth/verify',{data:captured.auth});
  ok('Remote login challenge replay refused',replayAuth.status()===409);
  const unknown=await context.request.post(root+'/s0-server/auth/options',{data:{flowId:'00000000-0000-4000-8000-000000000000'}});
  ok('Remote unknown server state fails closed',unknown.status()===409);
  console.log(JSON.stringify({ok:true,checks,remoteEdge:true,physicalPhone:false,appUserOrSession:false,remoteD1:false,virtualAuthenticator:true}));
  await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
  await context.close();
}finally{await browser.close();}
