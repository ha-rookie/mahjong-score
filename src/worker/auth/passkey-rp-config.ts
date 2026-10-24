/**
 * S2-B reviewed server-owned WebAuthn relying party configuration.
 *
 * A Preview Worker uses a different HTTPS origin/RP ID from Production.
 * NEVER derive either from Request.url, Host, forwarded headers, browser
 * clientDataJSON or registration options. Preview needs a separate LINE
 * channel and a separately approved isolated D1 binding before deployment.
 */
export const PASSKEY_PRODUCTION_ORIGIN="https://mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_PRODUCTION_RP_ID="mahjong-score.ha-rookie.workers.dev";
export const PASSKEY_PRODUCTION_LINE_CHANNEL_ID="2011726648";

export interface PasskeyRelyingPartyEnv {
  PASSKEY_AUTH_ENVIRONMENT?:string;
  PASSKEY_PREVIEW_ORIGIN?:string;
  LINE_CHANNEL_ID?:string;
  LINE_CHANNEL_SECRET?:string;
}
export interface PasskeyRelyingParty {
  readonly environment:"production"|"isolated-preview";
  readonly origin:string;
  readonly rpId:string;
  readonly callbackUrl:string;
}

/** No fallback to a guessed Preview origin. */
export const resolvePasskeyRelyingParty=(
  env:PasskeyRelyingPartyEnv,
):PasskeyRelyingParty=>{
  const mode=env.PASSKEY_AUTH_ENVIRONMENT;
  if(mode===undefined||mode==="production"){
    return {
      environment:"production",origin:PASSKEY_PRODUCTION_ORIGIN,
      rpId:PASSKEY_PRODUCTION_RP_ID,
      callbackUrl:PASSKEY_PRODUCTION_ORIGIN+"/api/auth/line/callback",
    };
  }
  if(mode!=="isolated-preview")throw new Error("Unsupported passkey environment");
  const raw=env.PASSKEY_PREVIEW_ORIGIN;
  if(!raw||typeof raw!=="string")throw new Error("Explicit Preview origin required");
  let url:URL;
  try{url=new URL(raw);}catch{throw new Error("Invalid Preview origin");}
  // Workers.dev account is a deliberate allowlist; custom-domain support
  // requires a separately reviewed source change, never arbitrary URL strings.
  const domain=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ha-rookie\.workers\.dev$/;
  if(url.protocol!=="https:"||url.hostname===PASSKEY_PRODUCTION_RP_ID||
     !domain.test(url.hostname)||url.origin!==raw||url.pathname!=="/"||
     url.search||url.hash||url.username||url.password||url.port){
    throw new Error("Preview origin is not approved HTTPS Worker hostname");
  }
  // The existing Production LINE Login channel MUST NOT be reused in an
  // isolated test Worker, even if the Worker URL is valid.
  if(!env.LINE_CHANNEL_ID||
     env.LINE_CHANNEL_ID===PASSKEY_PRODUCTION_LINE_CHANNEL_ID||
     !env.LINE_CHANNEL_SECRET){
    throw new Error("Isolated Preview must use a separate configured LINE channel");
  }
  return {
    environment:"isolated-preview",origin:url.origin,rpId:url.hostname,
    callbackUrl:url.origin+"/api/auth/line/callback",
  };
};

/** A single explicit flag cannot silently enable enrollment on Production. */
export const isPasskeyEnrollmentActive=(env:PasskeyRelyingPartyEnv & {
  PASSKEY_REGISTRATION_ENABLED?:string;
}):boolean=>{
  if(env.PASSKEY_REGISTRATION_ENABLED!=="true"||
     !["production","isolated-preview"].includes(env.PASSKEY_AUTH_ENVIRONMENT??"")){
    return false;
  }
  try{resolvePasskeyRelyingParty(env);return true;}
  catch{return false;}
};
