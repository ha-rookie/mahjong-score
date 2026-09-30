import { useEffect, useState } from "react";
import { Button } from "./ui";
import { AUTH_SESSION_EXPIRED_EVENT } from "../infrastructure/api/browser-auth-session";

const sleep=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));

export function AuthSessionRecovery(){
  const [expired,setExpired]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    const handleExpired=()=>{setExpired(true);setError(null);};
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT,handleExpired);
    return()=>window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT,handleExpired);
  },[]);

  const reauthenticate=async()=>{
    setBusy(true);setError(null);
    const popup=window.open("about:blank","mahjong-reauth","popup=yes,width=480,height=720");
    if(!popup){setBusy(false);setError("再ログイン画面を開けませんでした。ポップアップを許可して、もう一度お試しください。");return;}
    try{
      popup.opener=null;
      const start=await fetch("/api/auth/line/start?response=json",{credentials:"same-origin",cache:"no-store"});
      if(!start.ok)throw new Error("start");
      const payload=await start.json() as {authorizationUrl?:string};
      if(!payload.authorizationUrl)throw new Error("authorization-url");
      popup.location.href=payload.authorizationUrl;
      for(let i=0;i<120;i++){
        await sleep(1000);
        if(popup.closed)throw new Error("popup-closed");
        try{
          const response=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
          if(response.ok){popup.close();setExpired(false);setBusy(false);setError(null);return;}
        }catch{
          // Keep polling while the authentication window is open.
        }
      }
      throw new Error("timeout");
    }catch(cause){
      if(!popup.closed)popup.close();
      setBusy(false);
      setError(cause instanceof Error&&cause.message==="popup-closed"?"再ログインが完了していません。もう一度お試しください。":"再ログインを確認できませんでした。入力内容は保持しています。もう一度お試しください。");
    }
  };

  if(!expired)return null;
  return <div className="confirm-backdrop" role="presentation">
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-expired-title">
      <div className="confirm-dialog__icon" aria-hidden="true">!</div>
      <h2 id="auth-expired-title">ログインの有効期限が切れました</h2>
      <p>入力途中の内容はそのまま保持しています。もう一度LINEでログインしたあと、保存操作を再実行してください。</p>
      {error?<p className="auth-status__error" role="alert">{error}</p>:null}
      <div className="confirm-dialog__actions">
        <Button disabled={busy} onClick={()=>void reauthenticate()}>{busy?"再ログインを確認しています…":"LINEで再ログイン"}</Button>
      </div>
    </div>
  </div>;
}
