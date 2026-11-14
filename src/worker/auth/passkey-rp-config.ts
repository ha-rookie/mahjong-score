/** Same server-owned WebAuthn RP/Origin for P0 (#358) and P1 (#361). */
import {
  PASSKEY_ORIGIN, PASSKEY_RP_ID, UAT_PASSKEY_ORIGIN, UAT_PASSKEY_RP_ID,
  resolvePasskeyRelyingParty as resolveP0RelyingParty,
} from "./passkey-rp";

export const PASSKEY_PRODUCTION_ORIGIN=PASSKEY_ORIGIN;
export const PASSKEY_PRODUCTION_RP_ID=PASSKEY_RP_ID;
export const PASSKEY_UAT_ORIGIN=UAT_PASSKEY_ORIGIN;
export const PASSKEY_UAT_RP_ID=UAT_PASSKEY_RP_ID;
/** Never reuse the Production LINE channel in the isolated Android UAT host. */
export const PASSKEY_PRODUCTION_LINE_CHANNEL_ID="2011726648";
export interface PasskeyRelyingPartyEnv {
  PASSKEY_ENV?:string;
  /** Old P1 selectors are forbidden to avoid a split from P0. */
  PASSKEY_AUTH_ENVIRONMENT?:string;
  PASSKEY_PREVIEW_ORIGIN?:string;
  LINE_CHANNEL_ID?:string;
  LINE_CHANNEL_SECRET?:string;
}
export interface PasskeyRelyingParty {
  readonly environment:"production"|"android-uat";
  readonly origin:string;
  readonly rpId:string;
  readonly callbackUrl:string;
}
/** Resolves from P0's fixed selector; never from a client Host or Origin. */
export const resolvePasskeyRelyingParty=(env:PasskeyRelyingPartyEnv):PasskeyRelyingParty=>{
  if(env.PASSKEY_AUTH_ENVIRONMENT!==undefined||env.PASSKEY_PREVIEW_ORIGIN!==undefined){
    throw new Error("Obsolete P1 passkey environment selectors are forbidden");
  }
  const rp=resolveP0RelyingParty(env);
  if(env.PASSKEY_ENV==="android-uat"&&
     (!env.LINE_CHANNEL_ID||!env.LINE_CHANNEL_SECRET||
      env.LINE_CHANNEL_ID===PASSKEY_PRODUCTION_LINE_CHANNEL_ID)){
    throw new Error("Android UAT requires a distinct configured LINE channel");
  }
  return {
    environment:env.PASSKEY_ENV==="android-uat"?"android-uat":"production",
    origin:rp.origin,rpId:rp.rpId,
    callbackUrl:rp.origin+"/api/auth/line/callback",
  };
};
/** Explicit flag only; legacy selectors and invalid UAT config fail closed. */
export const isPasskeyEnrollmentActive=(env:PasskeyRelyingPartyEnv & {
  PASSKEY_REGISTRATION_ENABLED?:string;
}):boolean=>{
  if(env.PASSKEY_REGISTRATION_ENABLED!=="true")return false;
  try{resolvePasskeyRelyingParty(env);return true;}
  catch{return false;}
};
