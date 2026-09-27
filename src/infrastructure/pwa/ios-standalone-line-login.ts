const LINE_LOGIN_URL_PATH = "/api/auth/line/start?response=json&handoff=1";
const LINE_LOGIN_ORIGIN = "https://access.line.me";
const HANDOFF_REDEEM_PATH = "/api/auth/pwa-handoff/redeem";
const LOGIN_BUTTON_SELECTOR = "button.login-gate__button";
const HANDOFF_STORAGE_KEY = "mahjong_ios_pwa_auth_handoff";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type AuthorizationUrlPayload = { authorizationUrl?: string; handoffToken?: string };

let installed = false;
let redeeming = false;

export const isAppleMobilePlatform = (userAgent:string,platform:string,maxTouchPoints:number) =>
  /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

export const isStandaloneDisplayMode = (displayModeStandalone:boolean,navigatorStandalone?:boolean) =>
  displayModeStandalone || navigatorStandalone === true;

const isIosStandaloneWebApp = () =>
  isAppleMobilePlatform(navigator.userAgent,navigator.platform,navigator.maxTouchPoints) &&
  isStandaloneDisplayMode(window.matchMedia("(display-mode: standalone)").matches,(navigator as NavigatorWithStandalone).standalone);

const clearHandoff = () => { try { sessionStorage.removeItem(HANDOFF_STORAGE_KEY); } catch { /* no-op */ } };
const saveHandoff = (token:string) => { try { sessionStorage.setItem(HANDOFF_STORAGE_KEY,token); } catch { /* no-op */ } };
const readHandoff = () => { try { return sessionStorage.getItem(HANDOFF_STORAGE_KEY); } catch { return null; } };

const redeemHandoff = async () => {
  if (redeeming) return;
  const handoffToken=readHandoff();
  if(!handoffToken) return;
  redeeming=true;
  try {
    const response=await fetch(HANDOFF_REDEEM_PATH,{
      method:"POST",
      credentials:"same-origin",
      cache:"no-store",
      headers:{"content-type":"application/json","accept":"application/json"},
      body:JSON.stringify({handoffToken}),
    });
    if(response.ok){
      clearHandoff();
      window.location.reload();
      return;
    }
    // 202 means LINE has not completed yet. Keep the one-time token for the
    // next focus/visibility event; do not poll D1 continuously.
    if(response.status!==202) clearHandoff();
  } finally {
    redeeming=false;
  }
};

const startLineLoginWithServerHandoff = async () => {
  // The OAuth provider may open Safari on iOS. That is now intentional: Safari
  // only completes LINE identity verification. It does not receive the app
  // session. The standalone PWA redeems a one-time server handoff afterward.
  try {
    const response=await fetch(LINE_LOGIN_URL_PATH,{credentials:"same-origin",cache:"no-store",headers:{accept:"application/json"}});
    if(!response.ok) throw new Error("LINE login start failed");
    const payload=await response.json() as AuthorizationUrlPayload;
    if(!payload.authorizationUrl||!payload.handoffToken) throw new Error("LINE handoff missing");
    const authorizationUrl=new URL(payload.authorizationUrl);
    if(authorizationUrl.origin!==LINE_LOGIN_ORIGIN) throw new Error("Unexpected LINE authorize origin");
    saveHandoff(payload.handoffToken);
    window.location.assign(authorizationUrl.toString());
  } catch {
    clearHandoff();
    window.location.assign("/api/auth/line/start");
  }
};

// Kept for existing bootstrap integration. Server-handoff callbacks no longer
// redirect here, but normal Safari login still can.
export const notifyLineLoginCompletion = () => new URL(window.location.href).searchParams.get("login")==="success";

export const installIosStandaloneLineLoginBridge = () => {
  if(installed||!isIosStandaloneWebApp()) return;
  installed=true;

  document.addEventListener("click",(event:MouseEvent)=>{
    const target=event.target;
    if(!(target instanceof Element)) return;
    const button=target.closest(LOGIN_BUTTON_SELECTOR);
    if(!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void startLineLoginWithServerHandoff();
  },true);

  // No interval polling: one D1 read only when the user returns to the PWA.
  window.addEventListener("focus",()=>void redeemHandoff());
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void redeemHandoff();});
  void redeemHandoff();
};
