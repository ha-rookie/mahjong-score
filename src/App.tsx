import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Game, Group, Player, PlayerId, Session } from "./domain";
import type { ActiveSessionSummary, SessionResultsSummary, PlayerPerformanceAggregate } from "./application/use-cases";
import { createBrowserServices } from "./infrastructure/composition";
import { Button, Section, TextField } from "./components/ui";

type View = "home" | "session-setup" | "results" | "history" | "performance";
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
  const [sessionResults,setSessionResults]=useState<SessionResultsSummary|null>(null);
  const [history,setHistory]=useState<readonly Session[]>([]);
  const [performance,setPerformance]=useState<readonly PlayerPerformanceAggregate[]>([]);
  const [performancePeriod,setPerformancePeriod]=useState<"all"|"year"|"month">("all");
  const [performanceYear,setPerformanceYear]=useState(new Date().getFullYear());
  const [performanceMonth,setPerformanceMonth]=useState(new Date().getMonth()+1);
  const [groupName,setGroupName]=useState("");
  const [playerName,setPlayerName]=useState("");
  const [selectedPlayerIds,setSelectedPlayerIds]=useState<readonly string[]>([]);
  const [sessionDate,setSessionDate]=useState(getLocalDateValue);
  const [scoreInputs,setScoreInputs]=useState<Record<string,string>>({});
  const [editingGameId,setEditingGameId]=useState<string|null>(null);
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
  const loadPerformance=async(period=performancePeriod,year=performanceYear,month=performanceMonth)=>{if(!group)return;setIsBusy(true);setErrorMessage(null);const filter=period==="all"?undefined:period==="year"?{year}:{year,month};const r=await services.getPlayerPerformanceAggregates.execute(group.id,filter);if(!r.ok)setErrorMessage(r.error.userMessage??"通算成績を読み込めませんでした。");else{setPerformance(r.value);setView("performance");}setIsBusy(false);};
  const openPerformance=async()=>{setPerformancePeriod("all");await loadPerformance("all");};
  const openHistory=async()=>{if(!group)return;setIsBusy(true);setErrorMessage(null);const r=await services.listFinalizedSessions.execute(group.id);if(!r.ok)setErrorMessage(r.error.userMessage??"過去の麻雀を読み込めませんでした。");else{setHistory(r.value);setView("history");}setIsBusy(false);};
  const openHistoryResult=async(id:string)=>{setIsBusy(true);setErrorMessage(null);const r=await services.getSessionResults.execute(id);if(!r.ok||!r.value)setErrorMessage(r.ok?"結果を読み込めませんでした。":r.error.userMessage??"結果を読み込めませんでした。");else{setSessionResults(r.value);setView("results");}setIsBusy(false);};
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
    const r=editingGameId?await services.updateGame.execute({gameId:editingGameId,scorePointsByPlayer:scores,tags:[]}):await services.addGameResult.execute({sessionId:activeSession.session.id,scorePointsByPlayer:scores,tags:[]});
    if(!r.ok){setErrorMessage(r.error.userMessage??"半荘結果を保存できませんでした。");setIsBusy(false);return;}
    setScoreInputs({});setEditingGameId(null);await refresh(group.id);setStatusMessage(editingGameId?"半荘結果を更新しました。":"半荘結果を保存しました。");setIsBusy(false);
  };
  const startEditGame=(game:Game)=>{const autoPlayerId=participantIds[participantIds.length-1];setEditingGameId(game.id);setScoreInputs(Object.fromEntries(game.results.map(x=>[x.playerId,x.playerId===autoPlayerId?"":String(x.scorePoint)])));};
  const handleDeleteGame=async(game:Game)=>{if(!group||!window.confirm(`${game.sequence}半荘目を削除しますか？`))return;setIsBusy(true);const r=await services.deleteGame.execute(game.id);if(!r.ok)setErrorMessage(r.error.userMessage??"削除できませんでした。");else{if(editingGameId===game.id){setEditingGameId(null);setScoreInputs({});}await refresh(group.id);setStatusMessage("半荘結果を削除しました。");}setIsBusy(false);};
  const chipParsed=participantIds.map(id=>{const raw=chipInputs[id]?.trim()??"";return {id,raw,value:/^-?\d+$/.test(raw)?Number(raw):null};});
  const chipEntered=chipParsed.filter(x=>x.raw!==""&&x.value!==null);const chipInvalid=chipParsed.some(x=>x.raw!==""&&x.value===null);const canCalcChip=participantIds.length>=3&&!chipInvalid&&chipEntered.length===participantIds.length-1;const chipMissingId=canCalcChip?chipParsed.find(x=>x.raw==="")?.id:null;const calculatedChip=canCalcChip?-chipEntered.reduce((s,x)=>s+(x.value??0),0):null;
  const chipValue=(id:string)=>id===chipMissingId&&calculatedChip!==null?calculatedChip:(chipParsed.find(x=>x.id===id)?.value??0);
  const toggleChipSign=(id:string)=>setChipInputs(current=>{const raw=current[id]??"";if(raw==="")return current;return {...current,[id]:raw.startsWith("-")?raw.slice(1):"-"+raw};});
  const saveSessionDetails=async()=>{if(!activeSession||!group||!canCalcChip)return;const chips=participantIds.map(id=>({playerId:id,chipCount:chipValue(id)}));setIsBusy(true);const r=await services.updateSessionDetails.execute({sessionId:activeSession.session.id,note:sessionNote.trim()||null,participantNotes:activeSession.session.participantNotes,chipResults:chips});if(!r.ok)setErrorMessage(r.error.userMessage??"精算情報を保存できませんでした。");else{await refresh(group.id);setStatusMessage("チップとメモを保存しました。");}setIsBusy(false);};
  const handleFinalizeSession=async()=>{if(!activeSession||!group||!window.confirm("このSessionを終了しますか？"))return;const sessionId=activeSession.session.id;setIsBusy(true);setErrorMessage(null);const r=await services.finalizeSession.execute(sessionId);if(!r.ok){setErrorMessage(r.error.userMessage??"Sessionを終了できませんでした。");setIsBusy(false);return;}const result=await services.getSessionResults.execute(sessionId);if(!result.ok||!result.value){setErrorMessage(result.ok?"結果を読み込めませんでした。":result.error.userMessage??"結果を読み込めませんでした。");await refresh(group.id);setIsBusy(false);return;}setSessionResults(result.value);setScoreInputs({});setEditingGameId(null);setChipInputs({});setSessionNote("");await refresh(group.id);setStatusMessage("Sessionを終了しました。");setView("results");setIsBusy(false);};
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
      view==="results"&&sessionResults?<section className="score-session">
        <p className="screen-eyebrow">SESSION RESULTS</p><h1>{sessionResults.session.sessionDate}</h1>
        <p className="score-session__meta">{getModeLabel(sessionResults.participantPlayerIds.length)} · {sessionResults.games.length}半荘</p>
        {(()=>{const ids=sessionResults.participantPlayerIds;const sums=new Map<string,number>();for(const g of sessionResults.games)for(const r of g.results)sums.set(r.playerId,(sums.get(r.playerId)??0)+r.scorePoint);const chip=(id:string)=>sessionResults.session.chipResults.find(x=>x.playerId===id)?.chipCount??0;const final=(id:string)=>(sums.get(id)??0)+chip(id)*5;const sorted=[...ids].sort((a,b)=>final(b)-final(a));const rank=(id:string)=>sorted.findIndex(x=>final(x)===final(id))+1;return <><div className={"score-sheet score-sheet--"+ids.length}><div className="score-sheet__corner">半荘</div>{ids.map(id=><div className="score-sheet__player" key={"rh"+id}>{playerNameById(id)}</div>)}{sessionResults.games.map(g=><div className="score-sheet__row" key={g.id}><div className="score-sheet__label">{g.sequence}</div>{ids.map(id=><div className="score-sheet__value" key={id}>{formatScore(g.results.find(r=>r.playerId===id)?.scorePoint??0)}</div>)}</div>)}<div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">小計</div>{ids.map(id=><div className="score-sheet__value" key={id}>{formatScore(sums.get(id)??0)}</div>)}</div><div className="score-sheet__row"><div className="score-sheet__label">チップ</div>{ids.map(id=><div className="score-sheet__value" key={id}>{formatScore(chip(id))}</div>)}</div><div className="score-sheet__row"><div className="score-sheet__label">換算</div>{ids.map(id=><div className="score-sheet__value" key={id}>{formatScore(chip(id)*5)}</div>)}</div><div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">合計</div>{ids.map(id=><div className="score-sheet__value" key={id}>{formatScore(final(id))}</div>)}</div><div className="score-sheet__row"><div className="score-sheet__label">順位</div>{ids.map(id=><div className="score-sheet__value" key={id}>{rank(id)}位</div>)}</div></div><div className={"score-sheet score-sheet--"+ids.length}><div className="score-sheet__corner">名前</div>{ids.map(id=><div className="score-sheet__player" key={"rf"+id}>{playerNameById(id)}</div>)}</div><Button block onClick={()=>{setSessionResults(null);setStatusMessage(null);setView("home");}}>Homeへ戻る</Button></>})()}
      </section>:
      view==="performance"&&group?<section className="session-setup"><p className="screen-eyebrow">PERFORMANCE</p><h1>成績</h1><div className="period-controls"><div className="period-tabs">{(["all","year","month"] as const).map(p=><button key={p} type="button" className={performancePeriod===p?"tag-toggle tag-toggle--active":"tag-toggle"} onClick={()=>{setPerformancePeriod(p);void loadPerformance(p);}}>{p==="all"?"通算":p==="year"?"年間":"月間"}</button>)}</div>{performancePeriod!=="all"?<div className="period-selectors"><select aria-label="年" value={performanceYear} onChange={e=>{const y=Number(e.target.value);setPerformanceYear(y);void loadPerformance(performancePeriod,y,performanceMonth);}}>{Array.from({length:6},(_,i)=>new Date().getFullYear()-i).map(y=><option key={y} value={y}>{y}年</option>)}</select>{performancePeriod==="month"?<select aria-label="月" value={performanceMonth} onChange={e=>{const m=Number(e.target.value);setPerformanceMonth(m);void loadPerformance("month",performanceYear,m);}}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}月</option>)}</select>:null}</div>:null}</div>{performance.length===0?<p className="empty-hint">終了済みSessionの成績はまだありません。</p>:<div className="performance-list">{performance.map((a,index)=><article className="performance-card" key={a.playerId}><div><span className="performance-card__rank">{index+1}</span><strong>{playerNameById(a.playerId)}</strong></div><dl><div><dt>最終pt</dt><dd>{formatScore(a.finalPointTotal)}</dd></div><div><dt>麻雀pt</dt><dd>{formatScore(a.mahjongPointTotal)}</dd></div><div><dt>1位</dt><dd>{a.firstPlaceCount}回</dd></div><div><dt>Session</dt><dd>{a.sessionCount}回</dd></div><div><dt>半荘</dt><dd>{a.gameCount}回</dd></div></dl></article>)}</div>}</section>:
      view==="history"&&group?<section className="session-setup"><p className="screen-eyebrow">HISTORY</p><h1>過去の麻雀</h1>{history.length===0?<p className="empty-hint">終了済みのSessionはまだありません。</p>:<div className="form-stack">{history.map(s=><Button key={s.id} block variant="secondary" disabled={isBusy} onClick={()=>void openHistoryResult(s.id)}>{s.sessionDate} の結果を見る</Button>)}</div>}</section>:
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
            <div className="score-sheet__label score-sheet__label--actions"><span>{game.sequence}</span><button className="icon-action" type="button" aria-label={`${game.sequence}半荘目を編集`} title="編集" onClick={()=>startEditGame(game)}><svg className="edit-pencil-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4.2L19 9.2 14.8 5 4 15.8V20Z"/><path d="m13.7 6.1 4.2 4.2"/><path d="M4 20h16"/></svg></button></div>{participantIds.map(id=>{const v=resultFor(game,id);return <div className="score-sheet__value" key={id}>{v===undefined?"—":formatScore(v)}</div>;})}
          </div>)}
          <div className="score-sheet__row score-sheet__row--input">
            <div className="score-sheet__label">{editingGameId?"訂正":games.length+1}</div>{participantIds.map(id=><div className="score-sheet__input-cell" key={id}>{missingId===id&&calculatedScore!==null?<output>{formatScore(calculatedScore)}</output>:<><input aria-label={playerNameById(id)+"のポイント"} inputMode="numeric" pattern="[0-9]*" placeholder="入力" value={scoreInputs[id]??""} onChange={e=>setScoreInputs(current=>({...current,[id]:e.target.value.replace(/[^0-9-]/g,"")}))}/><button className="sign-toggle" type="button" onClick={()=>toggleScoreSign(id)} disabled={!scoreInputs[id]}>±</button></>}</div>)}
          </div>
          <div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">小計</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore(totals.get(id)??0)}</div>)}</div>
        </div>
        <p className="score-sheet__hint">1人分だけ空欄にして、残りを入力してください。負数は数字を入力してから ± を押します。</p>
        <Button block disabled={!canCalculate||isBusy} onClick={()=>void handleSaveGame()}>{isBusy?"保存しています…":editingGameId?"訂正を保存":"この半荘を保存"}</Button>
        {editingGameId?<div className="edit-actions"><Button block variant="quiet" onClick={()=>{setEditingGameId(null);setScoreInputs({});}}>訂正をやめる</Button><button className="delete-icon-action" type="button" aria-label="この半荘を削除" title="削除" onClick={()=>{const game=games.find(item=>item.id===editingGameId);if(game)void handleDeleteGame(game);}}>🗑</button></div>:null}
        <section className="settlement"><h2>チップ・メモ</h2><p className="score-sheet__hint">チップも1人分だけ空欄にします。1枚 = 5pt。</p><div className={"score-sheet score-sheet--"+participantIds.length}><div className="score-sheet__corner">チップ</div>{participantIds.map(id=><div className="score-sheet__player" key={"ch"+id}>{playerNameById(id)}</div>)}<div className="score-sheet__row score-sheet__row--input"><div className="score-sheet__label">枚</div>{participantIds.map(id=><div className="score-sheet__input-cell" key={id}>{chipMissingId===id&&calculatedChip!==null?<output>{formatScore(calculatedChip)}</output>:<><input inputMode="numeric" pattern="[0-9]*" value={chipInputs[id]??""} placeholder="入力" onChange={e=>setChipInputs(x=>({...x,[id]:e.target.value.replace(/[^0-9-]/g,"")}))}/><button className="sign-toggle" type="button" onClick={()=>toggleChipSign(id)} disabled={!chipInputs[id]}>±</button></>}</div>)}</div><div className="score-sheet__row"><div className="score-sheet__label">換算</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore(chipValue(id)*5)}</div>)}</div><div className="score-sheet__row score-sheet__row--subtotal"><div className="score-sheet__label">合計</div>{participantIds.map(id=><div className="score-sheet__value" key={id}>{formatScore((totals.get(id)??0)+chipValue(id)*5)}</div>)}</div></div><label className="memo-field">Sessionメモ<textarea value={sessionNote} onChange={e=>setSessionNote(e.target.value)} /></label><Button block disabled={!canCalcChip||isBusy} onClick={()=>void saveSessionDetails()}>チップ・メモを保存</Button></section><section className="session-end"><Button block variant="quiet" disabled={isBusy} onClick={()=>void handleFinalizeSession()}>Sessionを終了</Button></section>
      </section>:
      <><section className="home-hero"><p className="screen-eyebrow">HOME</p><h1>仲間との麻雀を、静かに記録する。</h1><p className="home-hero__meta">{group.name} · {players.length}人登録</p>{players.length>=3?<Button block onClick={openSessionSetup}>今日の麻雀を始める</Button>:<p className="empty-hint">Sessionを始めるには、メンバーを3人以上登録してください。</p>}<Button block variant="secondary" disabled={isBusy} onClick={()=>void openHistory()}>過去の麻雀を見る</Button><Button block variant="secondary" disabled={isBusy} onClick={()=>void openPerformance()}>通算成績を見る</Button></section>
      <Section eyebrow="GROUP" title="メンバー" action={<span className="member-count">{players.length}</span>}>
        <ul className="member-list">{players.map(p=><li key={p.id}><span className="member-avatar">{p.displayName.slice(0,1)}</span><span>{p.displayName}</span></li>)}</ul>
        <form className="member-form" onSubmit={handleAddPlayer}><TextField id="player-name" label="メンバーを追加" value={playerName} onChange={e=>setPlayerName(e.target.value)}/><Button type="submit" variant="secondary">追加</Button></form>
      </Section></>}
    </main><footer className="app-footer"><p>三麻スコア · Phase 1</p></footer>
  </div>;
}
export default App;
