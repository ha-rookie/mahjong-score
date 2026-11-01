/** Fixed, server-owned WebAuthn relying parties. Never derive trust from a request. */
export type PasskeyRelyingParty=Readonly<{origin:string;rpId:string}>;
export const PASSKEY_ORIGIN="https://mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_RP_ID="mahjong-score.ha-rookie.workers.dev";
export const UAT_PASSKEY_ORIGIN="https://mahjong-score-android-uat.ha-rookie.workers.dev";
export const UAT_PASSKEY_RP_ID="mahjong-score-android-uat.ha-rookie.workers.dev";
export const PRODUCTION_PASSKEY:PasskeyRelyingParty=Object.freeze({
  origin:PASSKEY_ORIGIN,rpId:PASSKEY_RP_ID,
});
export const ANDROID_UAT_PASSKEY:PasskeyRelyingParty=Object.freeze({
  origin:UAT_PASSKEY_ORIGIN,rpId:UAT_PASSKEY_RP_ID,
});
/** Production stays the default. Only the server's fixed UAT selector enables UAT. */
export const resolvePasskeyRelyingParty=(env:{PASSKEY_ENV?:string}):PasskeyRelyingParty=>{
  if(env.PASSKEY_ENV===undefined)return PRODUCTION_PASSKEY;
  if(env.PASSKEY_ENV==="android-uat")return ANDROID_UAT_PASSKEY;
  throw new Error("Unsupported passkey environment");
};
