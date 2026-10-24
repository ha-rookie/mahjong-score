import { useEffect, useState } from "react";
import {
  getRegistrationAttestation, webauthnRegistrationSupported,
  type RegistrationOptionsEnvelope,
} from "../infrastructure/api/passkey-browser";

type Capability={registrationEnabled:boolean};
const post=async(path:string,body:unknown):Promise<Response>=>fetch(path,{
  method:"POST",credentials:"same-origin",cache:"no-store",
  headers:{"content-type":"application/json"},
  body:JSON.stringify(body),
});
const allowedAuthorizeUrl=(raw:string):boolean=>{
  try{
    const u=new URL(raw);
    return u.origin==="https://access.line.me" &&
      u.pathname==="/oauth2/v2.1/authorize" &&
      u.searchParams.get("response_type")==="code" &&
      u.searchParams.get("prompt")==="login" &&
      u.searchParams.get("max_age")==="0";
  }catch{return false;}
};
const hasValidEnvelope=(data:unknown):data is RegistrationOptionsEnvelope=>{
  if(!data||typeof data!=="object"||Array.isArray(data))return false;
  const e=data as Record<string,unknown>;
  return typeof e.flowId==="string"&&/^[0-9a-f-]{36}$/.test(e.flowId)&&
    typeof e.expiresAt==="string"&&typeof e.options==="object"&&e.options!==null;
};
export function PasskeyEnrollment(){
  const [enabled,setEnabled]=useState(false);
  const [verified,setVerified]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [failed,setFailed]=useState(false);

  useEffect(()=>{
    let live=true;
    // The URL marker is only a display hint. Never show "verified" based on
    // query parameters: an attacker can append them without LINE authentication.
    const url=new URL(window.location.href);
    const returned=url.searchParams.get("passkey_stepup")==="verified";
    if(url.searchParams.has("passkey_stepup")){
      url.searchParams.delete("passkey_stepup");
      window.history.replaceState({}, "", url.pathname+url.search+url.hash);
    }
    void (async()=>{
      try{
        const res=await fetch("/api/auth/passkey/capabilities",{
          credentials:"same-origin",cache:"no-store",
        });
        if(!res.ok)return;
        const cap=await res.json() as Capability;
        if(!live||cap.registrationEnabled!==true)return;
        setEnabled(true);
        // Authoritative fresh proof status comes from the Worker, requiring
        // the original verified signed-in User and unconsumed HttpOnly proof.
        const status=await fetch("/api/auth/passkey/stepup/status",{
          credentials:"same-origin",cache:"no-store",
        });
        if(!live)return;
        if(!status.ok){
          if(returned){
            setMessage("本人確認を確認できませんでした。LINEで本人確認からやり直してください。");
            setFailed(true);
          }
          return;
        }
        const payload=await status.json() as {verified?:unknown};
        if(!live)return;
        if(payload.verified===true){
          setVerified(true);
        }else if(returned){
          setMessage("本人確認の期限が切れたか、別のセッションです。もう一度LINEで本人確認してください。");
          setFailed(true);
        }
      }catch{
        // Fail closed if either capability or proof-status API is unavailable.
        if(live&&returned){
          setMessage("本人確認を確認できませんでした。もう一度LINEで本人確認してください。");
          setFailed(true);
        }
      }
    })();
    return()=>{live=false;};
  },[]);

  const begin=async()=>{
    if(busy)return;
    setBusy(true);setMessage(null);setFailed(false);
    try{
      const response=await post("/api/auth/passkey/stepup/start",{});
      if(!response.ok)throw new Error("start_failed");
      const data=await response.json() as {authorizationUrl?:unknown};
      if(typeof data.authorizationUrl!=="string"||
          !allowedAuthorizeUrl(data.authorizationUrl))throw new Error("invalid_redirect");
      // Full-page redirect preserves the existing cookie for LINE's registered
      // callback, including on mobile where popup cookies can be isolated.
      window.location.assign(data.authorizationUrl);
    }catch{
      setMessage("LINEの本人確認を開始できませんでした。時間をおいて再試行してください。");
      setFailed(true);setBusy(false);
    }
  };
  const register=async()=>{
    if(busy)return;
    setBusy(true);setMessage(null);setFailed(false);
    try{
      if(!webauthnRegistrationSupported())throw new Error("unsupported_webauthn");
      const start=await post("/api/auth/passkey/register/options",{});
      if(!start.ok)throw new Error("options_failed");
      const envelope=await start.json() as unknown;
      if(!hasValidEnvelope(envelope))throw new Error("invalid_options");
      if(Date.parse(envelope.expiresAt)<=Date.now())throw new Error("expired_options");
      const credential=await getRegistrationAttestation(envelope.options);
      const result=await post("/api/auth/passkey/register/verify",{
        flowId:envelope.flowId,credential,
      });
      if(!result.ok)throw new Error("verification_failed");
      const status=await result.json() as {registered?:boolean};
      if(status.registered!==true)throw new Error("registration_not_confirmed");
      setMessage("パスキーを登録しました。LINEログインは引き続き利用できます。");
      setVerified(false);
    }catch(e){
      const cancelled=e instanceof Error&&["NotAllowedError","AbortError"].includes(e.name);
      setMessage(cancelled?"パスキーの登録をキャンセルしました。再度LINEで本人確認してからお試しください。":
        "登録を完了できませんでした。LINEの本人確認から再度お試しください。");
      setFailed(true);
      setVerified(false);
    }finally{setBusy(false);}
  };
  // The server has the sole authority to enable this control. An absent or
  // unavailable capability endpoint never exposes a clickable enrollment UI.
  if(!enabled)return null;
  const supported=webauthnRegistrationSupported();
  return <div className="passkey-enroll">
    <p className="passkey-enroll__title">パスキーを追加</p>
    <p className="passkey-enroll__description">
      {verified?"LINEの本人確認が完了しました。登録へ進めます。":
        "追加する前にLINEで本人確認します。既存のグループ・成績は変わりません。"}
    </p>
    {!supported?<p className="passkey-enroll__notice" role="status">このブラウザはパスキー登録に対応していません。</p>:null}
    <button type="button" disabled={!supported||busy}
      onClick={()=>void (verified?register():begin())}>
      {busy?"確認中…":verified?"端末にパスキーを登録":"LINEで本人確認"}
    </button>
    {message?<p className={failed?"passkey-enroll__error":"passkey-enroll__notice"} role="status">{message}</p>:null}
  </div>;
}
