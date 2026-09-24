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

type GroupSummary = { id: string; name: string };
type CloudPlayer = { id: string; displayName: string; userId?: string | null };
type InvitationResult = {
  id: string;
  playerId: string;
  playerDisplayName: string;
  inviteUrl: string;
  expiresAt: string;
};

export function AuthStatus() {
  const [auth,setAuth]=useState<AuthPayload|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [showInvites,setShowInvites]=useState(false);
  const [groups,setGroups]=useState<GroupSummary[]>([]);
  const [selectedGroupId,setSelectedGroupId]=useState("");
  const [players,setPlayers]=useState<CloudPlayer[]>([]);
  const [invite,setInvite]=useState<InvitationResult|null>(null);

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

  useEffect(()=>{
    void load();
    const url=new URL(window.location.href);
    const inviteResult=url.searchParams.get("invite");
    if(inviteResult==="accepted")setNotice("招待を受け付け、Playerと紐付けました。");
    if(inviteResult==="invalid")setError("招待URLは無効または期限切れです。");
    if(inviteResult==="conflict")setError("このLINEアカウントは別のPlayerに紐付いています。");
    if(url.searchParams.has("login")||url.searchParams.has("invite")){
      url.searchParams.delete("login");url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.pathname+url.search+url.hash);
    }
  },[]);

  const login=()=>{window.location.assign("/api/auth/line/start");};
  const logout=async()=>{setBusy(true);setError(null);try{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});setAuth(null);setShowInvites(false);}catch{setError("ログアウトできませんでした。");}setBusy(false);};
  const bootstrap=async()=>{setBusy(true);setError(null);try{const response=await fetch("/api/auth/bootstrap-admin",{method:"POST",credentials:"same-origin"});if(!response.ok){const payload=await response.json() as {error?:{message?:string}};throw new Error(payload.error?.message??"bootstrap");}setAuth(await response.json() as AuthPayload);}catch{setError("管理者の初期設定に失敗しました。");}setBusy(false);};

  const loadPlayers=async(groupId:string)=>{
    if(!groupId){setPlayers([]);return;}
    const response=await fetch(`/api/groups/${encodeURIComponent(groupId)}/players`,{credentials:"same-origin"});
    if(!response.ok)throw new Error("players");
    const payload=await response.json() as {players:CloudPlayer[]};
    setPlayers(payload.players);
  };

  const openInvites=async()=>{
    setBusy(true);setError(null);setInvite(null);
    try{
      const response=await fetch("/api/groups",{credentials:"same-origin"});
      if(!response.ok)throw new Error("groups");
      const payload=await response.json() as {groups:GroupSummary[]};
      setGroups(payload.groups);
      const groupId=payload.groups[0]?.id??"";
      setSelectedGroupId(groupId);
      await loadPlayers(groupId);
      setShowInvites(true);
    }catch{setError("招待対象を読み込めませんでした。");}
    setBusy(false);
  };

  const changeGroup=async(groupId:string)=>{
    setSelectedGroupId(groupId);setInvite(null);setBusy(true);setError(null);
    try{await loadPlayers(groupId);}catch{setError("Playerを読み込めませんでした。");}
    setBusy(false);
  };

  const createInvite=async(player:CloudPlayer)=>{
    setBusy(true);setError(null);setInvite(null);
    try{
      const response=await fetch(`/api/groups/${encodeURIComponent(selectedGroupId)}/players/${encodeURIComponent(player.id)}/invitations`,{method:"POST",credentials:"same-origin"});
      const payload=await response.json() as {invitation?:InvitationResult;error?:{message?:string}};
      if(!response.ok||!payload.invitation)throw new Error(payload.error?.message??"invite");
      setInvite(payload.invitation);
    }catch{setError("招待URLを発行できませんでした。");}
    setBusy(false);
  };

  const copyInvite=async()=>{
    if(!invite)return;
    try{await navigator.clipboard.writeText(invite.inviteUrl);setNotice("招待URLをコピーしました。");}
    catch{setError("招待URLをコピーできませんでした。");}
  };

  if(loading)return <div className="auth-status auth-status--loading">認証確認中</div>;
  if(!auth)return <div className="auth-status">{error?<span className="auth-status__error">{error}</span>:null}<button className="auth-login-button" type="button" onClick={login}>LINEでログイン</button></div>;

  const membership=auth.memberships[0]??null;
  const roleLabel=auth.user.systemRole==="admin"?"System Admin":membership?.role==="group_admin"?"Group Admin":membership?"Member":"招待待ち";
  const canInvite=auth.user.systemRole==="admin"||auth.memberships.some(x=>x.role==="group_admin");

  return <>
    <div className="auth-status">
      <div className="auth-status__identity">
        <span className="auth-status__name">{auth.user.displayName??"LINEユーザー"}</span>
        <span className={`auth-status__role ${!membership&&auth.user.systemRole!=="admin"?"auth-status__role--pending":""}`}>{roleLabel}</span>
      </div>
      {auth.canBootstrapAdmin?<button className="auth-bootstrap-button" type="button" disabled={busy} onClick={()=>void bootstrap()}>{busy?"設定中…":"初期管理者に設定"}</button>:null}
      {canInvite?<button className="auth-bootstrap-button" type="button" disabled={busy} onClick={()=>void openInvites()}>招待</button>:null}
      <button className="auth-logout-button" type="button" disabled={busy} onClick={()=>void logout()}>ログアウト</button>
      {notice?<span className="auth-status__notice">{notice}</span>:null}
      {error?<span className="auth-status__error">{error}</span>:null}
    </div>

    {showInvites?<div className="confirm-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowInvites(false);}}>
      <div className="confirm-dialog invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-dialog-title">
        <h2 id="invite-dialog-title">PlayerをLINEで招待</h2>
        <p>発行したURLは7日間有効で、1回だけ使用できます。新しく発行すると同じPlayerの旧URLは無効になります。</p>
        {groups.length===0?<div className="invite-empty">クラウド側にグループがありません。既存データのD1移行後に招待できます。</div>:<>
          <label className="invite-field">グループ
            <select value={selectedGroupId} disabled={busy} onChange={e=>void changeGroup(e.target.value)}>
              {groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <div className="invite-player-list">
            {players.map(player=><div className="invite-player-row" key={player.id}>
              <span>{player.displayName}</span>
              {player.userId?<span className="invite-linked">紐付け済み</span>:<button type="button" disabled={busy} onClick={()=>void createInvite(player)}>招待URL発行</button>}
            </div>)}
            {players.length===0?<div className="invite-empty">このグループにPlayerが登録されていません。</div>:null}
          </div>
          {invite?<div className="invite-result">
            <strong>{invite.playerDisplayName}さん用</strong>
            <textarea readOnly value={invite.inviteUrl} aria-label="招待URL" />
            <button type="button" onClick={()=>void copyInvite()}>URLをコピー</button>
          </div>:null}
        </>}
        <div className="confirm-dialog__actions invite-dialog__actions"><button className="button button--secondary" type="button" onClick={()=>setShowInvites(false)}>閉じる</button></div>
      </div>
    </div>:null}
  </>;
}
