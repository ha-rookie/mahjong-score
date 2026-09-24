import { useEffect, useState } from "react";
import type { Group, Player } from "../domain";

type GroupRole = "group_admin" | "member";
type AuthPayload = {
  authenticated: true;
  user: { id: string; displayName: string | null; systemRole: "admin" | "user" };
  memberships: Array<{ groupId:string; role:GroupRole }>;
};

type CloudPlayer = {
  id:string;
  displayName:string;
  userId?:string|null;
  linkedUserDisplayName?:string|null;
  groupRole?:GroupRole|null;
};

type UserOption = {
  id:string;
  displayName:string|null;
  systemRole:"admin"|"user";
  groupRole:GroupRole|null;
  playerId:string|null;
  playerDisplayName:string|null;
};

type InvitationResult = {
  id:string;
  playerId:string;
  playerDisplayName:string;
  inviteUrl:string;
  expiresAt:string;
};

interface Props {
  group: Group;
  players: readonly Player[];
}

export function MemberAccessManagement({group,players}:Props){
  const [auth,setAuth]=useState<AuthPayload|null>(null);
  const [cloudPlayers,setCloudPlayers]=useState<CloudPlayer[]>([]);
  const [users,setUsers]=useState<UserOption[]>([]);
  const [busyPlayerId,setBusyPlayerId]=useState<string|null>(null);
  const [linkingPlayerId,setLinkingPlayerId]=useState<string|null>(null);
  const [selectedUserId,setSelectedUserId]=useState("");
  const [invite,setInvite]=useState<InvitationResult|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=async()=>{
    setError(null);
    try{
      const authResponse=await fetch("/api/auth/me",{credentials:"same-origin"});
      const authPayload=authResponse.ok?await authResponse.json() as AuthPayload:null;
      setAuth(authPayload);
      const playersResponse=await fetch(`/api/groups/${encodeURIComponent(group.id)}/players`,{credentials:"same-origin"});
      if(playersResponse.ok){
        const payload=await playersResponse.json() as {players:CloudPlayer[]};
        setCloudPlayers(payload.players);
      }else setCloudPlayers([]);
      if(authPayload?.user.systemRole==="admin"){
        const usersResponse=await fetch(`/api/admin/groups/${encodeURIComponent(group.id)}/users`,{credentials:"same-origin"});
        if(usersResponse.ok){
          const payload=await usersResponse.json() as {users:UserOption[]};
          setUsers(payload.users);
        }else setUsers([]);
      }else setUsers([]);
    }catch{setError("メンバーのLINE連携状態を読み込めませんでした。");}
  };

  useEffect(()=>{void load();},[group.id]);

  const isSystemAdmin=auth?.user.systemRole==="admin";
  const canInvite=Boolean(auth&&(isSystemAdmin||auth.memberships.some(x=>x.groupId===group.id&&x.role==="group_admin")));
  const cloudPlayer=(playerId:string)=>cloudPlayers.find(x=>x.id===playerId);
  const availableUsers=(playerId:string)=>users.filter(u=>u.playerId===null||u.playerId===playerId);

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

  const saveUserLink=async(player:Player,userId:string,role:GroupRole="member")=>{
    if(!userId)return;
    setBusyPlayerId(player.id);setInvite(null);setNotice(null);setError(null);
    try{
      const response=await fetch(`/api/admin/groups/${encodeURIComponent(group.id)}/users/${encodeURIComponent(userId)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({role,playerId:player.id}),
      });
      const payload=await response.json() as {ok?:boolean;error?:{message?:string}};
      if(!response.ok||!payload.ok)throw new Error(payload.error?.message??"link");
      setNotice(`${player.displayName}さんにUserを紐付けました。`);
      setLinkingPlayerId(null);setSelectedUserId("");
      await load();
    }catch{setError("UserとPlayerを紐付けできませんでした。");}
    setBusyPlayerId(null);
  };

  const changeRole=async(player:Player,role:GroupRole)=>{
    const cp=cloudPlayer(player.id);if(!cp?.userId)return;
    setBusyPlayerId(player.id);setNotice(null);setError(null);
    try{
      const response=await fetch(`/api/admin/groups/${encodeURIComponent(group.id)}/users/${encodeURIComponent(cp.userId)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},credentials:"same-origin",
        body:JSON.stringify({role,playerId:player.id}),
      });
      const payload=await response.json() as {ok?:boolean;error?:{message?:string}};
      if(!response.ok||!payload.ok)throw new Error(payload.error?.message??"role");
      setNotice(`${player.displayName}さんの権限を更新しました。`);
      await load();
    }catch{setError("グループ権限を更新できませんでした。");}
    setBusyPlayerId(null);
  };

  const copyInvite=async()=>{
    if(!invite)return;
    try{await navigator.clipboard.writeText(invite.inviteUrl);setNotice("招待URLをコピーしました。");}
    catch{setError("招待URLをコピーできませんでした。");}
  };

  return <div className="member-access member-access--unified">
    {error?<div className="notice notice--error" role="alert">{error}</div>:null}
    {notice?<div className="notice" role="status">{notice}</div>:null}
    <ul className="member-access-list member-access-list--unified">
      {players.map(player=>{
        const cp=cloudPlayer(player.id);
        const userId=cp?.userId??null;
        const role=cp?.groupRole??"member";
        const options=availableUsers(player.id);
        return <li key={player.id} className="member-access-row">
          <div className="member-access-list__identity">
            <strong>{player.displayName}</strong>
            <div className="member-access__states">
              <span className={userId?"member-link-state member-link-state--linked":"member-link-state"}>{userId?"LINE連携済み":"未連携"}</span>
              {userId&&cp?.linkedUserDisplayName?<span className="member-linked-user">{cp.linkedUserDisplayName}</span>:null}
              {userId&&role==="group_admin"?<span className="member-role-state">Group Admin</span>:null}
            </div>
          </div>

          <div className="member-access-row__actions">
            {canInvite&&!userId?<button className="member-invite-button" type="button" disabled={busyPlayerId!==null} onClick={()=>void createInvite(player)}>{busyPlayerId===player.id?"発行中…":"LINEで招待"}</button>:null}
            {isSystemAdmin&&!userId?<button className="member-link-button" type="button" disabled={busyPlayerId!==null} onClick={()=>{setLinkingPlayerId(linkingPlayerId===player.id?null:player.id);setSelectedUserId("");}}>既存User</button>:null}
            {isSystemAdmin&&userId?<select className="member-role-select" aria-label={`${player.displayName}の権限`} value={role} disabled={busyPlayerId!==null} onChange={e=>void changeRole(player,e.target.value as GroupRole)}><option value="member">Member</option><option value="group_admin">Group Admin</option></select>:null}
            {isSystemAdmin&&userId?<button className="member-unlink-button" type="button" disabled={busyPlayerId!==null} onClick={()=>void unlinkPlayer(player)}>{busyPlayerId===player.id?"解除中…":"連携解除"}</button>:null}
          </div>

          {isSystemAdmin&&!userId&&linkingPlayerId===player.id?<div className="member-link-panel">
            <select value={selectedUserId} onChange={e=>setSelectedUserId(e.target.value)}>
              <option value="">Userを選択</option>
              {options.map(user=><option key={user.id} value={user.id}>{user.displayName??"名称未設定"}{user.systemRole==="admin"?"（System Admin）":user.groupRole==="group_admin"?"（Group Admin）":user.groupRole==="member"?"（Member）":""}</option>)}
            </select>
            <button type="button" disabled={!selectedUserId||busyPlayerId!==null} onClick={()=>void saveUserLink(player,selectedUserId)}>紐付け</button>
            {options.length===0?<span>紐付け可能な既存Userはいません</span>:null}
          </div>:null}
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
