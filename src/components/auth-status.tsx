import { useEffect, useState } from "react";

type Membership = {
  groupId: string;
  groupName: string;
  role: "group_admin" | "member";
  playerId: string | null;
  playerDisplayName: string | null;
};

type AuthPayload = {
  authenticated: true;
  user: { id: string; displayName: string | null; systemRole: "admin" | "user" };
  memberships: Membership[];
  canBootstrapAdmin: boolean;
};

export function AuthStatus() {
  const [auth,setAuth]=useState<AuthPayload|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [hasLegacyData,setHasLegacyData]=useState(false);

  const load=async()=>{
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/auth/me",{credentials:"same-origin"});
      if(response.status===401){setAuth(null);window.dispatchEvent(new CustomEvent("mahjong:auth-state",{detail:null}));setLoading(false);return;}
      if(!response.ok)throw new Error("auth status");
      const payload=await response.json() as AuthPayload;setAuth(payload);window.dispatchEvent(new CustomEvent("mahjong:auth-state",{detail:payload}));
    }catch{setError("認証状態を確認できませんでした。");window.dispatchEvent(new CustomEvent("mahjong:auth-state",{detail:null}));}
    setLoading(false);
  };

  useEffect(()=>{
    void load();
    setHasLegacyData(window.localStorage.getItem("mahjong-score:app-data:v1")!==null&&window.localStorage.getItem("mahjong-score:persistence-mode")!=="d1");
    const url=new URL(window.location.href);
    const inviteResult=url.searchParams.get("invite");
    const loginSucceeded=url.searchParams.get("login")==="success";
    if(loginSucceeded&&window.localStorage.getItem("mahjong-score:app-data:v1")===null&&window.localStorage.getItem("mahjong-score:persistence-mode")!=="d1"){
      window.localStorage.setItem("mahjong-score:persistence-mode","d1");
      url.searchParams.delete("login");url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname+url.search+url.hash);
      window.location.reload();return;
    }
    if(inviteResult==="accepted")window.dispatchEvent(new CustomEvent("mahjong:notice",{detail:"招待を受け付け、Playerと紐付けました。"}));
    if(inviteResult==="invalid")window.dispatchEvent(new CustomEvent("mahjong:error",{detail:"招待URLは無効または期限切れです。"}));
    if(inviteResult==="conflict")window.dispatchEvent(new CustomEvent("mahjong:error",{detail:"このLINEアカウントは別のPlayerに紐付いています。"}));
    if(url.searchParams.has("login")||url.searchParams.has("invite")){
      url.searchParams.delete("login");url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname+url.search+url.hash);
    }
  },[]);

  const login=()=>{window.location.assign("/api/auth/line/start");};
  const logout=async()=>{setBusy(true);setError(null);try{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});setAuth(null);window.dispatchEvent(new CustomEvent("mahjong:auth-state",{detail:null}));}catch{setError("ログアウトできませんでした。");}setBusy(false);};
  const bootstrap=async()=>{setBusy(true);setError(null);try{const response=await fetch("/api/auth/bootstrap-admin",{method:"POST",credentials:"same-origin"});if(!response.ok){const payload=await response.json() as {error?:{message?:string}};throw new Error(payload.error?.message??"bootstrap");}const payload=await response.json() as AuthPayload;setAuth(payload);window.dispatchEvent(new CustomEvent("mahjong:auth-state",{detail:payload}));}catch{setError("管理者の初期設定に失敗しました。");}setBusy(false);};
  const migrateToD1=async()=>{
    const raw=window.localStorage.getItem("mahjong-score:app-data:v1");
    if(!raw)return;
    if(!window.confirm("この端末の麻雀データをクラウドへ移行します。端末側の元データは削除せず残します。実行しますか？"))return;
    setBusy(true);setError(null);
    try{
      const data=JSON.parse(raw) as unknown;
      const response=await fetch("/api/admin/migrate-local-v1",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({data})});
      const payload=await response.json() as {ok?:boolean;error?:{message?:string}};
      if(!response.ok||!payload.ok)throw new Error(payload.error?.message??"migration");
      window.localStorage.setItem("mahjong-score:persistence-mode","d1");
      window.location.reload();
    }catch{setError("クラウド移行に失敗しました。端末データは変更していません。");}
    setBusy(false);
  };

  if(loading)return <div className="auth-status auth-status--loading">認証確認中</div>;
  if(!auth)return <div className="auth-status">{error?<span className="auth-status__error">{error}</span>:null}<button className="auth-login-button" type="button" onClick={login}>LINEでログイン</button></div>;

  const membership=auth.memberships[0]??null;
  const roleLabel=auth.user.systemRole==="admin"?"管理者":membership?.role==="group_admin"?"グループ管理者":membership?"メンバー":"招待待ち";

  return <div className="auth-status">
    <details className="account-menu">
      <summary className="account-menu__summary">
        <span className="account-menu__name">{auth.user.displayName??"LINEユーザー"}</span>
        <span className="account-menu__chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="account-menu__panel">
        <div className="account-menu__meta">
          <strong>{auth.user.displayName??"LINEユーザー"}</strong>
          <span>{roleLabel}</span>
        </div>
        {auth.canBootstrapAdmin?<button type="button" disabled={busy} onClick={()=>void bootstrap()}>初期管理者に設定</button>:null}
        {auth.user.systemRole==="admin"&&hasLegacyData?<button type="button" disabled={busy} onClick={()=>void migrateToD1()}>D1へ移行</button>:null}
        <button type="button" disabled={busy} onClick={()=>void logout()}>ログアウト</button>
        {error?<span className="auth-status__error">{error}</span>:null}
      </div>
    </details>
  </div>;
}
