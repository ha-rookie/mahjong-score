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

  const execute=async(mode:"register"|"login")=>{
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
      // Both endpoints issue the existing authVersion cookie. Reload ensures
      // the app reads memberships and stored scores through the existing APIs.
      window.location.assign("/");
    }catch(error){
      const cancelled=error instanceof Error&&["NotAllowedError","AbortError"].includes(error.name);
      setNotice(cancelled?"認証をキャンセルしました。もう一度お試しください。":
        mode==="register"?"登録できませんでした。招待の期限や端末の設定をご確認ください。":
          "ログインできませんでした。登録したパスキーを選択して再試行してください。");
    }finally{setBusy(false);}
  };
  return <div className="passkey-guest">
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
