import { useEffect, useState } from "react";
import {
  getRegistrationAttestation, webauthnRegistrationSupported,
  type RegistrationOptionsEnvelope,
} from "../infrastructure/api/passkey-browser";
type Capability={registrationEnabled:boolean};
type RegistrationStatus={registered:boolean;count:number};
const post=async(path:string,body:unknown):Promise<Response>=>fetch(path,{
  method:"POST",credentials:"same-origin",cache:"no-store",
  headers:{"content-type":"application/json"},body:JSON.stringify(body),
});
const valid=(data:unknown):data is RegistrationOptionsEnvelope=>{
  if(!data||typeof data!=="object"||Array.isArray(data))return false;
  const e=data as Record<string,unknown>;
  return typeof e.flowId==="string"&&/^[0-9a-f-]{36}$/.test(e.flowId)&&
    typeof e.expiresAt==="string"&&typeof e.options==="object"&&e.options!==null;
};
export function PasskeyEnrollment(){
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [failed,setFailed]=useState(false);
  const [registeredCount,setRegisteredCount]=useState<number|null>(null);
  const [statusUnavailable,setStatusUnavailable]=useState(false);
  const refreshStatus=async()=>{
    try{
      const response=await fetch("/api/auth/passkey/register/status",{
        credentials:"same-origin",cache:"no-store",
      });
      if(!response.ok)throw new Error("registration_status_unavailable");
      const data=await response.json() as RegistrationStatus;
      if(!Number.isSafeInteger(data.count)||data.count<0||
          data.registered!==(data.count>0))throw new Error("invalid_status");
      setRegisteredCount(data.count);
      setStatusUnavailable(false);
    }catch{
      // Unknown must not be displayed as "not registered".
      setRegisteredCount(null);
      setStatusUnavailable(true);
    }
  };
  useEffect(()=>{
    let live=true;
    void (async()=>{
      try{
        const res=await fetch("/api/auth/passkey/capabilities",{credentials:"same-origin",cache:"no-store"});
        if(!res.ok)return;
        const cap=await res.json() as Capability;
        if(live&&cap.registrationEnabled===true){
          setEnabled(true);
          // The status endpoint checks the same signed-in User as registration.
          void refreshStatus();
        }
      }catch{/* Worker unavailable: hide the control */}
    })();
    return()=>{live=false;};
  },[]);
  const register=async()=>{
    if(busy)return;
    setBusy(true);setMessage(null);setFailed(false);
    try{
      if(!webauthnRegistrationSupported())throw new Error("unsupported_webauthn");
      const response=await post("/api/auth/passkey/register/options",{});
      if(!response.ok)throw new Error("options_failed_"+response.status);
      const envelope=await response.json() as unknown;
      if(!valid(envelope)||Date.parse(envelope.expiresAt)<=Date.now())
        throw new Error("invalid_options");
      const credential=await getRegistrationAttestation(envelope.options);
      const result=await post("/api/auth/passkey/register/verify",{flowId:envelope.flowId,credential});
      if(!result.ok)throw new Error("verification_failed_"+result.status);
      const status=await result.json() as {registered?:boolean};
      if(status.registered!==true)throw new Error("registration_not_confirmed");
      setMessage("パスキーを登録しました。次回からパスキーでログインできます。");
      await refreshStatus();
    }catch(e){
      const cancelled=e instanceof Error&&["NotAllowedError","AbortError"].includes(e.name);
      const reason=e instanceof Error?e.message:"unknown";
      setMessage(cancelled?"パスキーの登録をキャンセルしました。":
        reason.startsWith("verification_failed_")?
          "端末側の操作は終わりましたが、アプリへの保存に失敗しました。もう一度登録してください。":
        reason.startsWith("options_failed_")?
          "登録準備に失敗しました。ログイン状態や通信状況を確認してください。":
        "パスキーを登録できませんでした。ブラウザのパスキー設定を確認して再試行してください。");
      setFailed(true);
    }finally{setBusy(false);}
  };
  if(!enabled)return null;
  const supported=webauthnRegistrationSupported();
  return <div className="passkey-enroll">
    <p className="passkey-enroll__title">パスキーを追加</p>
    <p className="passkey-enroll__description">
      ログイン中のアカウントに登録します。LINEでの再認証は不要です。
    </p>
    <p className="passkey-enroll__notice" role="status" aria-live="polite">
      {registeredCount===null?
        (statusUnavailable?"登録状況を確認できません。再読み込みして確認してください。":"登録状況を確認中…"):
        registeredCount===0?"未登録":
          `登録済み（${registeredCount}件）`}
    </p>
    {registeredCount!==null&&registeredCount>0?
      <p className="passkey-enroll__description">アカウントの登録件数です。端末内の保存先を示すものではありません。</p>:null}
    {!supported?<p className="passkey-enroll__notice" role="status">このブラウザはパスキー登録に対応していません。</p>:null}
    <button type="button" disabled={!supported||busy} onClick={()=>void register()}>
      {busy?"登録中…":registeredCount!==null&&registeredCount>0?
        "別のパスキーを追加":"パスキーを登録"}
    </button>
    {message?<p className={failed?"passkey-enroll__error":"passkey-enroll__notice"} role="status">{message}</p>:null}
  </div>;
}
