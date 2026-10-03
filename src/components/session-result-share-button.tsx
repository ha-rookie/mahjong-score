import { useEffect, useState } from "react";
import type { Game, Player, Session } from "../domain";
import {
  buildSessionShareClipboardText,
  buildSessionShareSummary,
  buildSessionShareText,
  normalizeAppTopUrl,
  type SessionShareSummary,
} from "../shared/session-result-share";

type Props = {
  session: Session;
  disabled?: boolean;
  onError: (message: string | null) => void;
  onStatus: (message: string | null) => void;
};

type GamesResponse = { games?: Game[] };
type PlayersResponse = { players?: Player[] };

export function SessionResultShareButton({ session, disabled=false, onError, onStatus }: Props) {
  const [summary,setSummary]=useState<SessionShareSummary|null>(null);
  const [preparing,setPreparing]=useState(true);
  const [prepareFailed,setPrepareFailed]=useState(false);
  const [sharing,setSharing]=useState(false);

  useEffect(()=>{
    let cancelled=false;
    setSummary(null);setPreparing(true);setPrepareFailed(false);
    void Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(session.id)}/games`),
      fetch(`/api/groups/${encodeURIComponent(session.groupId)}/players`),
    ]).then(async([gamesResponse,playersResponse])=>{
      if(!gamesResponse.ok||!playersResponse.ok)throw new Error("share_data");
      const gamesPayload=await gamesResponse.json() as GamesResponse;
      const playersPayload=await playersResponse.json() as PlayersResponse;
      const games=gamesPayload.games??[];
      if(games.length===0)throw new Error("share_data");
      if(cancelled)return;
      setSummary(buildSessionShareSummary(session,games,playersPayload.players??[]));
    }).catch(()=>{
      if(!cancelled)setPrepareFailed(true);
    }).finally(()=>{
      if(!cancelled)setPreparing(false);
    });
    return()=>{cancelled=true;};
  },[session.id,session.version]);

  const share=async()=>{
    if(disabled||sharing||preparing||session.status!=="finalized")return;
    if(!summary){
      if(prepareFailed)onError("共有する結果を準備できませんでした。もう一度開き直してください。");
      return;
    }
    setSharing(true);onError(null);onStatus(null);
    const text=buildSessionShareText(summary);
    const appTopUrl=normalizeAppTopUrl(window.location.origin);
    try{
      if(typeof navigator.share==="function"){
        try{
          await navigator.share({title:"三麻スコア",text,url:appTopUrl});
        }catch(error){
          if(error instanceof DOMException&&error.name==="AbortError")return;
          throw error;
        }
        return;
      }

      if(!navigator.clipboard?.writeText)throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(buildSessionShareClipboardText(summary,appTopUrl));
      onStatus("共有内容をコピーしました。");
    }catch(error){
      if(error instanceof DOMException&&error.name==="AbortError")return;
      if(error instanceof Error&&error.message==="clipboard_unavailable")onError("共有内容をコピーできませんでした。");
      else if(typeof navigator.share==="function")onError("結果を共有できませんでした。");
      else onError("共有内容をコピーできませんでした。");
    }finally{
      setSharing(false);
    }
  };

  return <button className="session-result-share" type="button" disabled={disabled||sharing||preparing} onClick={()=>void share()} aria-label="Session結果を共有">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>
    <span>{preparing||sharing?"準備中…":"共有"}</span>
  </button>;
}
