import { useEffect, useMemo, useState } from "react";
import { GAME_SCORE_ABS_MAX, type Game, type PlayerId } from "../domain";
import { Button } from "./ui";

interface Props {
  readonly game: Game;
  readonly participantPlayerIds: readonly PlayerId[];
  readonly playerNameById: (id:string)=>string;
  readonly disabled: boolean;
  readonly onCancel: ()=>void;
  readonly onBusyChange: (busy:boolean)=>void;
  readonly onError: (message:string|null)=>void;
  readonly onSaved: ()=>Promise<void>|void;
}

export function FinalizedGameCorrection({game,participantPlayerIds,playerNameById,disabled,onCancel,onBusyChange,onError,onSaved}:Props){
  const initial=useMemo(()=>Object.fromEntries(game.results.map(result=>[result.playerId,String(result.scorePoint)])),[game]);
  const [inputs,setInputs]=useState<Record<string,string>>(initial);
  useEffect(()=>setInputs(initial),[initial]);
  const parsed=participantPlayerIds.map(playerId=>{const raw=inputs[playerId]?.trim()??"";const value=/^-?\d+$/.test(raw)?Number(raw):null;return {playerId,raw,value};});
  const valid=parsed.length>=3&&parsed.every(item=>item.value!==null&&Math.abs(item.value)<=GAME_SCORE_ABS_MAX)&&parsed.reduce((sum,item)=>sum+(item.value??0),0)===0;
  const changed=game.results.some(result=>inputs[result.playerId]?.trim()!==String(result.scorePoint));
  const total=parsed.reduce((sum,item)=>sum+(item.value??0),0);

  const save=async()=>{
    if(!valid||!changed||disabled)return;
    if(!window.confirm("確定済みの過去データを修正します。成績集計にも反映されます。続けますか？"))return;
    onBusyChange(true);onError(null);
    try{
      const corrected=new Map(parsed.map(item=>[item.playerId,item.value as number]));
      const response=await fetch(`/api/games/${encodeURIComponent(game.id)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...game,expectedVersion:game.version,results:game.results.map(result=>({...result,scorePoint:corrected.get(result.playerId)??result.scorePoint})),tags:game.tags})});
      if(!response.ok){
        const payload=await response.json().catch(()=>null) as {error?:{code?:string;message?:string}}|null;
        if(response.status===403)onError("確定済み結果の修正はシステム管理者のみ実行できます。");
        else if(payload?.error?.code==="stale_update")onError("他の端末で結果が更新されました。最新状態を確認して再操作してください。");
        else onError(payload?.error?.message??"半荘結果を修正できませんでした。");
        return;
      }
      await onSaved();
    }catch{onError("半荘結果を修正できませんでした。");}
    finally{onBusyChange(false);}
  };

  return <section className="settlement" aria-label={`${game.sequence}半荘目の結果修正`}>
    <h2>{game.sequence}半荘目の結果修正</h2>
    <p className="score-sheet__hint">確定済みの過去データです。システム管理者だけが訂正できます。</p>
    <div className={"score-sheet score-sheet--"+participantPlayerIds.length}>
      <div className="score-sheet__corner">訂正</div>{participantPlayerIds.map(id=><div className="score-sheet__player" key={"correction-head-"+id}>{playerNameById(id)}</div>)}
      <div className="score-sheet__row score-sheet__row--input"><div className="score-sheet__label">pt</div>{participantPlayerIds.map(id=><div className="score-sheet__input-cell" key={id}><input aria-label={playerNameById(id)+"の訂正ポイント"} inputMode="numeric" value={inputs[id]??""} onChange={event=>setInputs(current=>({...current,[id]:event.target.value.replace(/[^0-9-]/g,"")}))}/></div>)}</div>
    </div>
    <p className="score-sheet__hint">合計: {total}pt（0ptになるように入力してください）</p>
    <div className="edit-actions"><Button block disabled={disabled||!valid||!changed} onClick={()=>void save()}>確定済み結果を修正</Button><Button block variant="quiet" disabled={disabled} onClick={onCancel}>キャンセル</Button></div>
  </section>;
}
