import assert from "node:assert/strict";

const source = await import("../src/components/ios-standalone-unsupported");

const originalNavigator = globalThis.navigator;
const originalWindow = globalThis.window;

const setEnvironment = (userAgent:string,platform:string,maxTouchPoints:number,displayStandalone:boolean,navigatorStandalone?:boolean) => {
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{userAgent,platform,maxTouchPoints,standalone:navigatorStandalone}});
  Object.defineProperty(globalThis,"window",{configurable:true,value:{matchMedia:()=>({matches:displayStandalone})}});
};

setEnvironment("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)","iPhone",5,true,true);
assert.equal(source.isIosStandaloneWebApp(),true);

setEnvironment("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)","iPhone",5,false,false);
assert.equal(source.isIosStandaloneWebApp(),false);

setEnvironment("Mozilla/5.0 (Linux; Android 16)","Linux armv8l",5,true,undefined);
assert.equal(source.isIosStandaloneWebApp(),false);

Object.defineProperty(globalThis,"navigator",{configurable:true,value:originalNavigator});
Object.defineProperty(globalThis,"window",{configurable:true,value:originalWindow});
console.log("ios standalone unsupported detection tests passed");
