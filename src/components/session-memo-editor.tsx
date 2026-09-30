import { useEffect, useState } from "react";
import { SESSION_NOTE_MAX_LENGTH, type Session } from "../domain";
import { Button } from "./ui";

type Props = {
  session: Session;
  editable: boolean;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onStatus: (message: string | null) => void;
  onUpdated: (note: string | null, version: number) => void;
};

type NoteUpdateResponse = {
  note: string | null;
  updatedAt: string;
  version: number;
};

type ErrorResponse = { error?: { code?: string } };

export function SessionMemoEditor({ session, editable, disabled=false, onBusyChange, onError, onStatus, onUpdated }: Props) {
  const [draft,setDraft]=useState(session.note??"");
  const [saving,setSaving]=useState(false);
  const [hasConflict,setHasConflict]=useState(false);

  useEffect(()=>{
    setDraft(session.note??"");
    setHasConflict(false);
  },[session.id,session.note,session.version]);

  if(!editable){
    return session.note?.trim()?<div className="session-result-note"><span>Sessionメモ</span><p>{session.note}</p></div>:null;
  }

  const normalized=draft.trim()||null;
  const savedNormalized=session.note?.trim()||null;
  const dirty=normalized!==savedNormalized;

  const save=async()=>{
    if(saving||disabled||!dirty)return;
    if(session.version===undefined){onError("Sessionの更新情報を確認できませんでした。もう一度開き直してください。");return;}
    setSaving(true);setHasConflict(false);onBusyChange(true);onError(null);onStatus(null);
    try{
      const response=await fetch(`/api/sessions/${encodeURIComponent(session.id)}/note`,{
        method:"PATCH",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({note:normalized,updatedAt:new Date().toISOString(),expectedVersion:session.version}),
      });
      const payload=await response.json().catch(()=>null) as NoteUpdateResponse|ErrorResponse|null;
      if(!response.ok){
        const code=(payload as ErrorResponse|null)?.error?.code;
        if(code==="stale_update"){
          const refreshed=await fetch(`/api/sessions/${encodeURIComponent(session.id)}`);
          const latest=refreshed.ok?await refreshed.json().catch(()=>null) as {session?:Session}|null:null;
          if(latest?.session&&latest.session.version!==undefined){
            setDraft(latest.session.note??"");
            onUpdated(latest.session.note,latest.session.version);
            setHasConflict(true);
          }
          onError("他の端末でSessionメモが更新されました。最新内容を確認して再操作してください。");
        }else if(code==="forbidden"){
          onError("Sessionメモを編集する権限がありません。");
        }else if(code==="session_not_found"){
          onError("このSessionは見つかりませんでした。過去の麻雀へ戻って最新状態を確認してください。");
        }else{
          onError("Sessionメモを保存できませんでした。");
        }
        return;
      }
      const saved=payload as NoteUpdateResponse;
      setDraft(saved.note??"");
      setHasConflict(false);
      onUpdated(saved.note,saved.version);
      onStatus("Sessionメモを保存しました。");
    }catch{
      onError("Sessionメモを保存できませんでした。");
    }finally{
      setSaving(false);onBusyChange(false);
    }
  };

  const stateClass=saving?"session-memo-save-state--saving":hasConflict?"session-memo-save-state--warning":dirty?"session-memo-save-state--dirty":"session-memo-save-state--saved";
  const stateIcon=saving?"…":hasConflict?"!":dirty?"●":"✓";
  const stateText=saving?"保存しています…":hasConflict?"最新内容を読み込みました。内容を確認してください。":dirty?"未保存の変更があります":"保存済み";

  return <div className="form-stack session-memo-editor">
    <label className="memo-field">Sessionメモ<textarea maxLength={SESSION_NOTE_MAX_LENGTH} value={draft} onChange={e=>{setDraft(e.target.value);setHasConflict(false);}} /></label>
    <div className={`session-memo-save-state ${stateClass}`} role="status" aria-live="polite"><span className="session-memo-save-state__icon" aria-hidden="true">{stateIcon}</span><span>{stateText}</span></div>
    {dirty?<Button block disabled={disabled||saving||session.version===undefined} onClick={()=>void save()}>{saving?"保存しています…":"メモの変更を保存"}</Button>:null}
  </div>;
}
