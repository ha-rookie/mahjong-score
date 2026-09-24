import { useEffect, useState } from "react";
import type { Group, Player } from "../domain";

type AuthPayload = {
  authenticated: true;
  user: { id: string; displayName: string | null; systemRole: "admin" | "user" };
  memberships: Array<{ groupId:string; role:"group_admin"|"member" }>;
};

type CloudPlayer = { id:string; displayName:string; userId?:string|null };
type InvitationResult = { id:string; playerId:string; playerDisplayName:string; inviteUrl:string; expiresAt:string };

interface Props {
  group: Group;
  players: readonly Player[];
}

export function MemberAccessManagement({group,players}:Props){
  const [auth,setAuth]=useState<AuthPayload|null>(null);
  const [cloudPlayers,setCloudPlayers]=useState<CloudPlayer[]>([]);
  const [busyPlayerId,setBusyPlayerId]=useState<string|null>(null);
  const [invite,setInvite]=useState<InvitationResult|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=async()=>{
    setError(null);
    try{
      const [authResponse,playersResponse]=await Promise.all([
        fetch("/api/auth/me",{credentials:"same-origin"}),
        fetch(`/api/groups/${encodeURIComponent(group.id)}/players`,{credentials:"same-origin"}),
      ]);
      if(authResponse.ok)setAuth(await authResponse.json() as AuthPayload);else setAuth(null);
      if(playersResponse.ok){
        const payload=await playersResponse.json() as {players:CloudPlayer[]};
        setCloudPlayers(payload.players);
      }else setCloudPlayers([]);
    }catch{setError("LINE連携状態を読み込めませんでした。");}
  };

  useEffect(()=>{void load();},[group.id]);

  const isSystemAdmin=auth?.user.systemRole==="admin";
  const canInvite=Boolean(auth&&(isSystemAdmin||auth.memberships.some(x=>x.groupId===group.id&&x.role==="group_admin")));
  const linked=(playerId:string)=>cloudPlayers.find(x=>x.id===playerId)?.userId??null;

  const createInvite=async(player:Player)=>{
    setBusyPlayerId(player.id);setInvite(null);setNotice(null);setError(null);
    try{
      const response=await fetch(`/api/groups/${encodeURIComponent(group.id)}/players/${encodeURIComponent(player.id)}/invitations`,{method:"POST",credentials:"same-origin"});
      const payload=await response.json() as {invitation?:InvitationResult;error?:{message?:string}};
      if(!response.ok||!payload.invitation)throw new Error(payload.error?.message??"invite");
      setInvite(payload.invitation);
      setNotice(`${player.displayName}さん用の招待URLを発行しました。`);
    }catch{setError("招待URLを発行できませんでした。");}
    setBusyPlayerId(null);
  };

  const unlinkPlayer=async(player:Player)=>{
    if(!window.confirm(`${player.displayName}さんのLINE連携を解除しますか？一般メンバーの場合は、このグループへの参加も解除されます。`))return;
    setBusyPlayerId(player.id);setInvite(null);setNotice(null);setError(null);
    try{
      const response=await fetch(`/api/admin/groups/${encodeURIComponent(group.id)}/players/${encodeURIComponent(player.id)}/link`,{method:"DELETE",credentials:"same-origin"});
      const payload=await response.json() as {ok?:boolean;error?:{message?:string}};
      if(!response.ok||!payload.ok)throw new Error(payload.error?.message??"unlink");
      setNotice(`${player.displayName}さんのLINE連携を解除しました。`);
      await load();
    }catch{setError("LINE連携を解除できませんでした。");}
    setBusyPlayerId(null);
  };

  const copyInvite=async()=>{
    if(!invite)return;
    try{await navigator.clipboard.writeText(invite.inviteUrl);setNotice("招待URLをコピーしました。");}
    catch{setError("招待URLをコピーできませんでした。");}
  };

  return <div className="member-access">
    <div className="member-access__heading">
      <div><span className="section__eyebrow">LINE ACCESS</span><h2>ログイン・招待</h2></div>
      {canInvite?<span className="member-access__hint">未紐付けのPlayerを招待できます</span>:null}
    </div>
    {error?<div className="notice notice--error" role="alert">{error}</div>:null}
    {notice?<div className="notice" role="status">{notice}</div>:null}
    <ul className="member-access-list">
      {players.map(player=>{
        const userId=linked(player.id);
        return <li key={player.id}>
          <div className="member-access-list__identity">
            <strong>{player.displayName}</strong>
            <span className={userId?"member-link-state member-link-state--linked":"member-link-state"}>{userId?"LINE連携済み":"未連携"}</span>
          </div>
          {canInvite&&!userId?<button className="member-invite-button" type="button" disabled={busyPlayerId!==null} onClick={()=>void createInvite(player)}>{busyPlayerId===player.id?"発行中…":"LINEで招待"}</button>:null}
          {isSystemAdmin&&userId?<button className="member-unlink-button" type="button" disabled={busyPlayerId!==null} onClick={()=>void unlinkPlayer(player)}>{busyPlayerId===player.id?"解除中…":"連携解除"}</button>:null}
        </li>;
      })}
    </ul>
    {invite?<div className="member-invite-result">
      <div><strong>{invite.playerDisplayName}さん用</strong><span>7日間有効・1回限り</span></div>
      <textarea readOnly value={invite.inviteUrl} aria-label="招待URL"/>
      <button type="button" onClick={()=>void copyInvite()}>URLをコピー</button>
    </div>:null}
  </div>;
}
