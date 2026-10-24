import { useState } from "react";

type PasskeyOptions={flowId:string;options:unknown;expiresAt:string;
  playerName?:string;groupName?:string};
const post=async(path:string,data:unknown)=>{
  const response=await fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},body:JSON.stringify(data)});
  if(!response.ok)throw new Error("Request failed");
  return response.json() as Promise<Record<string,unknown>>;
};
const supported=()=>typeof PublicKeyCredential!=="undefined" &&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON==="function" &&
  typeof PublicKeyCredential.parseRequestOptionsFromJSON==="function" &&
  typeof navigator.credentials?.create==="function" &&
  typeof navigator.credentials?.get==="function" &&
  window.isSecureContext;
const parseOptions=(data:Record<string,unknown>):PasskeyOptions=>{
  if(typeof data.flowId!=="string"||!data.options||typeof data.options!=="object"||
     typeof data.expiresAt!=="string")throw new Error("Malformed options");
  return data as PasskeyOptions;
};
const toJSON=(credential:Credential|null)=>{
  if(!credential||credential.type!=="public-key"||!("toJSON" in credential)||
     typeof credential.toJSON!=="function")throw new Error("No credential received");
  return credential.toJSON();
};
export function PasskeyGuestAccess(){
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const invite=new URL(window.location.href).searchParams.get("invite");
  const hasInvite=Boolean(invite&&/^[A-Za-z0-9_-]{43}$/.test(invite));
  const recoveryToken=new URL(window.location.href).searchParams.get("recover");
  const hasRecovery=Boolean(recoveryToken&&/^[A-Za-z0-9_-]{43}$/.test(recoveryToken));

  const execute=async(mode:"register"|"login"|"recover")=>{
    if(busy)return;
    setBusy(true);setNotice("");
    try{
      if(!supported())throw new Error("Browser WebAuthn unsupported");
      let flow:PasskeyOptions,attestation:unknown;
      if(mode==="register"){
        if(!hasInvite)throw new Error("Invitation required");
        flow=parseOptions(await post("/api/auth/passkey/invite/options",{token:invite}));
        const creation=PublicKeyCredential.parseCreationOptionsFromJSON(
          flow.options as PublicKeyCredentialCreationOptionsJSON);
        const credential=await navigator.credentials.create({publicKey:creation});
        attestation=toJSON(credential);
        const result=await post("/api/auth/passkey/invite/verify",{
          token:invite,flowId:flow.flowId,credential:attestation,
        });
        if(result.registered!==true)throw new Error("Registration not confirmed");
      }else if(mode==="recover"){
        if(!hasRecovery)throw new Error("Recovery link required");
        flow=parseOptions(await post("/api/auth/passkey/recovery/options",{token:recoveryToken}));
        const creation=PublicKeyCredential.parseCreationOptionsFromJSON(
          flow.options as PublicKeyCredentialCreationOptionsJSON);
        const credential=await navigator.credentials.create({publicKey:creation});
        const result=await post("/api/auth/passkey/recovery/verify",{
          token:recoveryToken,flowId:flow.flowId,credential:toJSON(credential),
        });
        if(result.registered!==true)throw new Error("Recovery registration failed");
      }else{
        flow=parseOptions(await post("/api/auth/passkey/login/options",{}));
        const request=PublicKeyCredential.parseRequestOptionsFromJSON(
          flow.options as PublicKeyCredentialRequestOptionsJSON);
        const credential=await navigator.credentials.get({publicKey:request});
        attestation=toJSON(credential);
        const result=await post("/api/auth/passkey/login/verify",{
          flowId:flow.flowId,credential:attestation,
        });
        if(result.authenticated!==true)throw new Error("Authentication not confirmed");
      }
      // Reuse the existing LINE success transition. On a fresh device without
      // legacy local data, AuthStatus switches persistence to cloud D1 before
      // rendering groups and historical scores; locally preserved data remains
      // untouched for users who still have old local records.
      window.location.assign("/?login=success");
    }catch(error){
      const cancelled=error instanceof Error&&["NotAllowedError","AbortError"].includes(error.name);
      setNotice(cancelled?"認証をキャンセルしました。もう一度お試しください。":
        mode==="recover"?"復旧できませんでした。管理者から受け取ったリンクの期限と対象を確認してください。":
        mode==="register"?"登録できませんでした。招待の期限や端末の設定をご確認ください。":
          "ログインできませんでした。登録したパスキーを選択して再試行してください。");
    }finally{setBusy(false);}
  };
  return <div className="passkey-guest">
    {hasRecovery?<div>
      <p>管理者から届いた復旧リンクです。元のUser・Player・成績を引き継いでパスキーを追加します。LINEログインは不要です。</p>
      <button type="button" className="login-gate__button" disabled={busy}
        onClick={()=>void execute("recover")}>元のアカウントにパスキーを登録</button>
    </div>:null}
    {hasInvite?<div>
      <p>招待を受けた方はLINEを使わず、端末のパスキーで参加できます。</p>
      <button type="button" className="login-gate__button" disabled={busy}
        onClick={()=>void execute("register")}>パスキーで参加（初回登録）</button>
    </div>:null}
    <div>
      <p>すでにパスキーを登録している方</p>
      <button type="button" className="login-gate__button" disabled={busy}
        onClick={()=>void execute("login")}>パスキーでログイン</button>
    </div>
    {notice?<p role="status" className="passkey-guest__error">{notice}</p>:null}
  </div>;
}
