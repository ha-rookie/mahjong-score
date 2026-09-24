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

  const load=async()=>{
    setLoading(true);setError(null);
    try{
      const response=await fetch("/api/auth/me",{credentials:"same-origin"});
      if(response.status===401){setAuth(null);setLoading(false);return;}
      if(!response.ok)throw new Error("auth status");
      setAuth(await response.json() as AuthPayload);
    }catch{setError("認証状態を確認できませんでした。");}
    setLoading(false);
  };

  useEffect(()=>{void load();const url=new URL(window.location.href);if(url.searchParams.get("login")==="success"){url.searchParams.delete("login");window.history.replaceState({}, "", url.pathname+url.search+url.hash);}},[]);

  const login=()=>{window.location.assign("/api/auth/line/start");};
  const logout=async()=>{setBusy(true);setError(null);try{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});setAuth(null);}catch{setError("ログアウトできませんでした。");}setBusy(false);};
  const bootstrap=async()=>{setBusy(true);setError(null);try{const response=await fetch("/api/auth/bootstrap-admin",{method:"POST",credentials:"same-origin"});if(!response.ok){const payload=await response.json() as {error?:{message?:string}};throw new Error(payload.error?.message??"bootstrap");}setAuth(await response.json() as AuthPayload);}catch{setError("管理者の初期設定に失敗しました。");}setBusy(false);};

  if(loading)return <div className="auth-status auth-status--loading">認証確認中</div>;
  if(!auth)return <div className="auth-status">{error?<span className="auth-status__error">{error}</span>:null}<button className="auth-login-button" type="button" onClick={login}>LINEでログイン</button></div>;

  const membership=auth.memberships[0]??null;const roleLabel=auth.user.systemRole==="admin"?"System Admin":membership?.role==="group_admin"?"Group Admin":membership?"Member":"招待待ち";
  return <div className="auth-status">
    <div className="auth-status__identity">
      <span className="auth-status__name">{auth.user.displayName??"LINEユーザー"}</span>
      <span className={`auth-status__role ${!membership&&auth.user.systemRole!=="admin"?"auth-status__role--pending":""}`}>{roleLabel}</span>
    </div>
    {auth.canBootstrapAdmin?<button className="auth-bootstrap-button" type="button" disabled={busy} onClick={()=>void bootstrap()}>{busy?"設定中…":"初期管理者に設定"}</button>:null}
    <button className="auth-logout-button" type="button" disabled={busy} onClick={()=>void logout()}>ログアウト</button>
    {error?<span className="auth-status__error">{error}</span>:null}
  </div>;
}
