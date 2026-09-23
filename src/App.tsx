import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Game, GameTagType, Group, Player, PlayerId } from "./domain";
import type { ActiveSessionSummary } from "./application/use-cases";
import { createBrowserServices } from "./infrastructure/composition";
import { Button, Section, TextField } from "./components/ui";

type View = "home" | "session-setup";
const getLocalDateValue = (): string => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-");
};
const getModeLabel = (count:number):string => count === 4 ? "4人回し三麻" : "3人三麻";
const formatScore = (value:number):string => (value > 0 ? "+" : "") + value;

function App() {
  const services=useMemo(()=>createBrowserServices(),[]);
  const [view,setView]=useState<View>("home");
  const [group,setGroup]=useState<Group|null>(null);
  const [players,setPlayers]=useState<readonly Player[]>([]);
  const [activeSession,setActiveSession]=useState<ActiveSessionSummary|null>(null);
  const [games,setGames]=useState<readonly Game[]>([]);
  const [groupName,setGroupName]=useState("");
  const [playerName,setPlayerName]=useState("");
  const [selectedPlayerIds,setSelectedPlayerIds]=useState<readonly string[]>([]);
  const [sessionDate,setSessionDate]=useState(getLocalDateValue);
  const [scoreInputs,setScoreInputs]=useState<Record<string,string>>({});
  const [editingGameId,setEditingGameId]=useState<string|null>(null);
  const [gameTagType,setGameTagType]=useState<GameTagType|"">("");
  const [chipInputs,setChipInputs]=useState<Record<string,string>>({});
  const [sessionNote,setSessionNote]=useState("");
  const [isLoading,setIsLoading]=useState(true);
  const [isBusy,setIsBusy]=useState(false);
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [statusMessage,setStatusMessage]=useState<string|null>(null);

  const refresh=useCallback(async(preferredGroupId?:string)=>{
    setIsLoading(true);setErrorMessage(null);
    const groupsResult=await services.listGroups.execute();
    if(!groupsResult.ok){setErrorMessage(groupsResult.error.userMessage??"グループを読み込めませんでした。");setIsLoading(false);return;}
    const currentGroup=groupsResult.value.find(x=>x.id===preferredGroupId)??groupsResult.value[0]??null;
    setGroup(currentGroup);
    if(currentGroup===null){setPlayers([]);setActiveSession(null);setGames([]);setIsLoading(false);return;}
    const [playersResult,activeResult]=await Promise.all([
      services.listPlayersByGroup.execute(currentGroup.id),services.getActiveSession.execute(currentGroup.id),
    ]);
    if(!playersResult.ok){setErrorMessage(playersResult.error.userMessage??"メンバーを読み込めませんでした。");setIsLoading(false);return;}
    if(!activeResult.ok){setErrorMessage(activeResult.error.userMessage??"Sessionを読み込めませんでした。");setIsLoading(false);return;}
    setPlayers(playersResult.value);setActiveSession(activeResult.value);
    if(activeResult.value){setSessionNote(activeResult.value.session.note??"");setChipInputs(Object.fromEntries(activeResult.value.session.chipResults.map(x=>[x.playerId,String(x.chipCount)])));}
    if(activeResult.value===null)setGames([]);
    else {
      const result=await services.listGamesBySession.execute(activeResult.value.session.id);
      if(!result.ok){setErrorMessage(result.error.userMessage??"半荘履歴を読み込めませんでした。");setIsLoading(false);return;}
      setGames(result.value);
    }
    setIsLoading(false);
  },[services]);
  useEffect(()=>{void refresh();},[refresh]);

  const playerNameById=(id:string)=>players.find(p=>p.id===id)?.displayName??"不明";
  const handleCreateGroup=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setIsBusy(true);setErrorMessage(null);
    const r=await services.createGroup.execute({name:groupName});
    if(!r.ok){setErrorMessage(r.error.userMessage??"グループを作成できませんでした。");setIsBusy(false);return;}
    setGroupName("");await refresh(r.value.id);setIsBusy(false);
  };
  const handleAddPlayer=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();if(!group)return;setIsBusy(true);setErrorMessage(null);
    const r=await services.addPlayerToGroup.execute({groupId:group.id,displayName:playerName});
    if(!r.ok){setErrorMessage(r.error.userMessage??"メンバーを追加できませんでした。");setIsBusy(false);return;}
    setPlayerName("");await refresh(group.id);setIsBusy(false);
  };
  const openSessionSetup=()=>{
    setSelectedPlayerIds(players.length>=3&&players.length<=4?players.map(p=>p.id):[]);
    setSessionDate(getLocalDateValue());setErrorMessage(null);setView("session-setup");
  };
  const toggleParticipant=(id:string)=>setSelectedPlayerIds(current=>{
    if(current.includes(id))return current.filter(x=>x!==id);
    return current.length>=4?current:[...current,id];
  });
  const handleStartSession=async()=>{
    if(!group)return;setIsBusy(true);setErrorMessage(null);
    const r=await services.startSession.execute({groupId:group.id,sessionDate,participantPlayerIds:selectedPlayerIds});
    if(!r.ok){setErrorMessage(r.error.userMessage??"Sessionを開始できませんでした。");setIsBusy(false);return;}
    await refresh(group.id);setScoreInputs({});setStatusMessage("Sessionを開始しました。");setView("home");setIsBusy(false);
  };

  const participantIds=activeSession?.participantPlayerIds??[];
  const parsedEntries=participantIds.map(id=>{
    const raw=scoreInputs[id]?.trim()??"";
    return {id,raw,value:/^-?\d+$/.test(raw)?Number(raw):null};
  });
  const entered=parsedEntries.filter(x=>x.raw!==""&&x.value!==null);
  const invalid=parsedEntries.some(x=>x.raw!==""&&x.value===null);
  const canCalculate=participantIds.length>=3&&!invalid&&entered.length===participantIds.length-1;
  const missingId=canCalculate?parsedEntries.find(x=>x.raw==="")?.id:null;
  const calculatedScore=canCalculate?-entered.reduce((sum,x)=>sum+(x.value??0),0):null;
  const toggleScoreSign=(id:string)=>setScoreInputs(current=>{const raw=current[id]??"";if(raw==="")return current;return {...current,[id]:raw.startsWith("-")?raw.slice(1):"-"+raw};});
  const handleSaveGame=async()=>{
    if(!activeSession||!group||!canCalculate||!missingId)return;
    const scores:Record<PlayerId,number|null>={};
    for(const id of participantIds)scores[id]=id===missingId?null:parsedEntries.find(x=>x.id===id)?.value??null;
    setIsBusy(true);setErrorMessage(null);setStatusMessage(null);
    const tags=gameTagType?[{type:gameTagType,playerId:null}]:[];
    const r=editingGameId?await services.updateGame.execute({gameId:editingGameId,scorePointsByPlayer:scores,tags}):await services.addGameResult.execute({sessionId:activeSession.session.id,scorePointsByPlayer:scores,tags});
    if(!r.ok){setErrorMessage(r.error.userMessage??"半荘結果を保存できませんでした。");setIsBusy(false);return;}
    setScoreInputs({});setEditingGameId(null);setGameTagType("");await refresh(group.id);setStatusMessage(editingGameId?"半荘結果を更新しました。":"半荘結果を保存しました。");setIsBusy(false);
  };
  const startEditGame=(game:Game)=>{setEditingGameId(game.id);setScoreInputs(Object.fromEntries(game.results.map(x=>[x.playerId,String(x.scorePoint)])));setGameTagType(game.tags[0]?.type??"");};
  const handleDeleteGame=async(game:Game)=>{if(!group||!window.confirm(`${game.sequence}半荘目を削除しますか？`))return;setIsBusy(true);const r=await services.deleteGame.execute(game.id);if(!r.ok)setErrorMessage(r.error.userMessage??"削除できませんでした。");else{if(editingGameId===game.id){setEditingGameId(null);setScoreInputs({});}await refresh(group.id);setStatusMessage("半荘結果を削除しました。");}setIsBusy(false);};
  const chipParsed=participantIds.map(id=>{const raw=chipInputs[id]?.trim()??"";return {id,raw,value:/^-?\d+$/.test(raw)?Number(raw):null};});
  const chipEntered=chipParsed.filter(x=>x.raw!==""&&x.value!==null);const chipInvalid=chipParsed.some(x=>x.raw!==""&&x.value===null);const canCalcChip=participantIds.length>=3&&!chipInvalid&&chipEntered.length===participantIds.length-1;const chipMissingId=canCalcChip?chipParsed.find(x=>x.raw==="")?.id:null;const calculatedChip=canCalcChip?-chipEntered.reduce((s,x)=>s+(x.value??0),0):null;
  const chipValue=(id:string)=>id===chipMissingId&&calculatedChip!==null?calculatedChip:(chipParsed.find(x=>x.id===id)?.value??0);
  const toggleChipSign=(id:string)=>setChipInputs(current=>{const raw=current[id]??"";if(raw==="")return current;return {...current,[id]:raw.startsWith("-")?raw.slice(1):"-"+raw};});
  const saveSessionDetails=async()=>{if(!activeSession||!group||!canCalcChip)return;const chips=participantIds.map(id=>({playerId:id,chipCount:chipValue(id)}));setIsBusy(true);const r=await services.updateSessionDetails.execute({sessionId:activeSession.session.id,note:sessionNote.trim()||null,participantNotes:activeSession.session.participantNotes,chipResults:chips});if(!r.ok)setErrorMessage(r.error.userMessage??"精算情報を保存できませんでした。");else{await refresh(group.id);setStatusMessage("チップとメモを保存しました。");}setIsBusy(false);};
  const totals=useMemo(()=>{
    const m=new Map<string,number>();for(const g of games)for(const r of g.results)m.set(r.playerId,(m.get(r.playerId)??0)+r.scorePoint);return m;
  },[games]);
  const resultFor=(game:Game,id:string)=>game.results.find(r=>r.playerId===id)?.scorePoint;

  return <div className="app-shell">
    <header className="app-header"><div className="app-header__inner">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span className="brand-tile"/><span className="brand-score-line brand-score-line--one"/><span className="brand-score-line brand-score-line--two"/><span className="brand-score-line brand-score-line--three"/></div><div><p className="eyebrow">MAHJONG SCORE</p><p className="brand-name">三麻スコア</p></div></div>
      {view!=="home"?<Button variant="quiet" onClick={()=>setView("home")}>戻る</Button>:null}
    </div></header>
    <main className="page">
      {errorMessage?<div className="notice notice--error" role="alert">{errorMessage}</div>:null}
      {statusMessage?<div className="notice" role="status">{statusMessage}</div>:null}
      {isLoading?<div className="loading">記録を読み込んでいます…</div>:
      view==="session-setup"&&group?<section className="session-setup">
        <p className="screen-eyebrow">SESSION SETUP</p><h1>今日の参加者</h1>
        <TextField id="session-date" label="日付" type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)}/>
        <fieldset className="member-choices"><legend>参加するメンバー</legend><div className="member-choice-list">{players.map(p=>{
          const selected=selectedPlayerIds.includes(p.id),locked=!selected&&selectedPlayerIds.length>=4;
          return <label className={"member-choice "+(selected?"member-choice--selected ":"")+(locked?"member-choice--disabled":"")} key={p.id}><input type="checkbox" checked={selected} disabled={locked} onChange={()=>toggleParticipant(p.id)}/><span className="member-choice__name">{p.displayName}</span><span className="member-choice__state">{selected?"参加":"不参加"}</span></label>;
        })}</div></fieldset>
        <div className="selection-summary"><span>{selectedPlayerIds.length}人選択</span><strong>{selectedPlayerIds.length===3||selectedPlayerIds.length===4?getModeLabel(selectedPlayerIds.length):"3人または4人を選択"}</strong></div>
        <Button block disabled={![3,4].includes(selectedPlayerIds.length)||isBusy} onClick={()=>void handleStartSession()}>このメンバーで開始</Button>
      </section>:
      group===null?<section className="welcome"><p className="screen-eyebrow">FIRST SETUP</p><h1>最初のグループを作る</h1><form className="form-stack" onSubmit={handleCreateGroup}><TextField id="group-name" label="グループ名" value={groupName} onChange={e=>setGroupName(e.target.value)}/><Button block disabled={isBusy} type="submit">グループを作成</Button></form></section>:
      activeSession?<section className="score-session">
        <div className="score-session__heading"><div><p className="screen-eyebrow">SCORE SHEET</p><h1>{activeSession.session.sessionDate}</h1><p className="score-session__meta">{getModeLabel(participantIds.length)} · {games.length}半荘</p></div></div>
        <div className={"score-sheet score-sheet--"+participantIds.length}>
          <div className="score-sheet__corner">半荘</div>{participantIds.map(id=><div className="score-sheet__player" key={"h"+id}>{playerNameById(id)}</div>)}
          {games.map(game=><div className="score-sheet__row" key={game.id}>
            <div className="score-sheet__label score-sheet__label--actions"><span>{game.sequence}</span><button className="icon-action" type="button" aria-label={`${game.sequence}半荘目を編集`} title="編集" onClick={()=>startEditGame(game)}>✎</button></div>{participantIds.map(id=>{const v=resultFor(game,id);return <div className="score-sheet__value" key={id}>{v===undefined?"—":formatScore(v)}</div>;})}
          </div>)}
          <div className="score-sheet__row score-sheet__row--input">
            <div className="score-sheet__label">{editingGameId?"訂正":games.length+1}</div>{participantIds.map(id=><div className="score-sheet__input-cell" key={id}>{missingId===id&&calculatedScore!==null?<output>{formatScore(calculatedScore)}</output>:<><input aria-label={playerNameById(id)+"のポイント"} inputMode="numeric" pattern="[0-9]*" placeholder="入力" value={scoreInputs[id]??""} onChange={e=>setScoreInputs(current=>({...current,[id]:e.target.value.replace(/[^0-9-]/g,"")}))}/><button className="sign-toggle" type="button" onClick={()=>toggleScoreSign(id)} disabled={!scoreInputs[id]}>±</button></>}</div>)}
          </div>
          <div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">小計</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore(totals.get(id)??0)}</div>)}</div>
        </div>
        <p className="score-sheet__hint">1人分だけ空欄にして、残りを入力してください。負数は数字を入力してから ± を押します。</p>
        <div className="game-tag-buttons game-tag-buttons--single" role="group" aria-label="半荘タグ"><button type="button" className={gameTagType==="yakuman"?"tag-toggle tag-toggle--active":"tag-toggle"} aria-pressed={gameTagType==="yakuman"} onClick={()=>setGameTagType(current=>current==="yakuman"?"":"yakuman")}>役満</button></div>
        <Button block disabled={!canCalculate||isBusy} onClick={()=>void handleSaveGame()}>{isBusy?"保存しています…":editingGameId?"訂正を保存":"この半荘を保存"}</Button>
        {editingGameId?<div className="edit-actions"><Button block variant="quiet" onClick={()=>{setEditingGameId(null);setScoreInputs({});setGameTagType("");}}>訂正をやめる</Button><button className="delete-icon-action" type="button" aria-label="この半荘を削除" title="削除" onClick={()=>{const game=games.find(item=>item.id===editingGameId);if(game)void handleDeleteGame(game);}}>🗑</button></div>:null}
        <section className="settlement"><h2>チップ・メモ</h2><p className="score-sheet__hint">チップも1人分だけ空欄にします。1枚 = 5pt。</p><div className={"score-sheet score-sheet--"+participantIds.length}><div className="score-sheet__corner">チップ</div>{participantIds.map(id=><div className="score-sheet__player" key={"ch"+id}>{playerNameById(id)}</div>)}<div className="score-sheet__row score-sheet__row--input"><div className="score-sheet__label">枚</div>{participantIds.map(id=><div className="score-sheet__input-cell" key={id}>{chipMissingId===id&&calculatedChip!==null?<output>{formatScore(calculatedChip)}</output>:<><input inputMode="numeric" pattern="[0-9]*" value={chipInputs[id]??""} placeholder="入力" onChange={e=>setChipInputs(x=>({...x,[id]:e.target.value.replace(/[^0-9-]/g,"")}))}/><button className="sign-toggle" type="button" onClick={()=>toggleChipSign(id)} disabled={!chipInputs[id]}>±</button></>}</div>)}</div><div className="score-sheet__row"><div className="score-sheet__label">換算</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore(chipValue(id)*5)}</div>)}</div><div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">合計</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore((totals.get(id)??0)+chipValue(id)*5)}</div>)}</div></div><label className="memo-field">Sessionメモ<textarea value={sessionNote} onChange={e=>setSessionNote(e.target.value)} /></label><Button block disabled={!canCalcChip||isBusy} onClick={()=>void saveSessionDetails()}>チップ・メモを保存</Button></section>
      </section>:
      <><section className="home-hero"><p className="screen-eyebrow">HOME</p><h1>仲間との麻雀を、静かに記録する。</h1><p className="home-hero__meta">{group.name} · {players.length}人登録</p>{players.length>=3?<Button block onClick={openSessionSetup}>今日の麻雀を始める</Button>:<p className="empty-hint">Sessionを始めるには、メンバーを3人以上登録してください。</p>}</section>
      <Section eyebrow="GROUP" title="メンバー" action={<span className="member-count">{players.length}</span>}>
        <ul className="member-list">{players.map(p=><li key={p.id}><span className="member-avatar">{p.displayName.slice(0,1)}</span><span>{p.displayName}</span></li>)}</ul>
        <form className="member-form" onSubmit={handleAddPlayer}><TextField id="player-name" label="メンバーを追加" value={playerName} onChange={e=>setPlayerName(e.target.value)}/><Button type="submit" variant="secondary">追加</Button></form>
      </Section></>}
    </main><footer className="app-footer"><p>三麻スコア · Phase 1</p></footer>
  </div>;
}
export default App;
