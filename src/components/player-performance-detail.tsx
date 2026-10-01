import { useEffect, useMemo, useState } from "react";
import type { PlayerPerformanceDetailAggregate } from "../application/use-cases";
import { derivePlayerPerformanceDetailMetrics } from "../application/use-cases/player-performance-detail-metrics";
import { Button } from "./ui";
import "./player-performance-detail.css";

type PerformancePeriod="all"|"year"|"month";

interface Props {
  readonly groupId:string;
  readonly playerId:string;
  readonly playerName:string;
  readonly initialPeriod:PerformancePeriod;
  readonly initialYear:number;
  readonly initialMonth:number;
  readonly onBack:()=>void;
}

const formatScore=(value:number)=>`${value>0?"+":""}${value}`;
const formatDecimal=(value:number)=>`${value>0?"+":""}${value.toFixed(1)}`;
const formatPercent=(value:number)=>`${Number.isInteger(value)?value.toFixed(0):value.toFixed(1)}%`;
const numberClass=(value:number)=>value<0?"number--negative":"";
const placementColors=["#176b57","#6f9b8d","#c09a61","#a24b42"] as const;

export function PlayerPerformanceDetail({groupId,playerId,playerName,initialPeriod,initialYear,initialMonth,onBack}:Props){
  const [period,setPeriod]=useState<PerformancePeriod>(initialPeriod);
  const [year,setYear]=useState(initialYear);
  const [month,setMonth]=useState(initialMonth);
  const [aggregate,setAggregate]=useState<PlayerPerformanceDetailAggregate|null>(null);
  const [isLoading,setIsLoading]=useState(true);
  const [loadFailed,setLoadFailed]=useState(false);
  const [reloadToken,setReloadToken]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      setIsLoading(true);setLoadFailed(false);
      try{
        const params=new URLSearchParams();
        if(period!=="all"){params.set("year",String(year));if(period==="month")params.set("month",String(month));}
        const response=await fetch(`/api/groups/${encodeURIComponent(groupId)}/players/${encodeURIComponent(playerId)}/performance-detail${params.size?"?"+params.toString():""}`);
        if(!response.ok)throw new Error("player-performance-detail");
        const payload=await response.json() as {performance:PlayerPerformanceDetailAggregate};
        if(!cancelled)setAggregate(payload.performance);
      }catch{
        if(!cancelled)setLoadFailed(true);
      }finally{
        if(!cancelled)setIsLoading(false);
      }
    };
    void load();
    return()=>{cancelled=true;};
  },[groupId,playerId,period,year,month,reloadToken]);

  const metrics=useMemo(()=>aggregate?derivePlayerPerformanceDetailMetrics(aggregate):null,[aggregate]);
  const donutBackground=useMemo(()=>{
    if(!metrics||!aggregate||aggregate.gameCount===0)return undefined;
    let cursor=0;
    const slices=metrics.placements.filter(item=>item.count>0).map(item=>{
      const start=cursor;
      cursor+=item.rate;
      return `${placementColors[item.placement-1]} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${slices.join(",")})`;
  },[aggregate,metrics]);
  const periodLabel=period==="all"?"通算":period==="year"?`${year}年`:`${year}年${month}月`;

  return <section className="session-setup player-performance-detail">
    <button className="player-performance-detail__back" type="button" onClick={onBack}>← 成績へ戻る</button>
    <p className="screen-eyebrow">PLAYER PERFORMANCE</p>
    <h1>{playerName}</h1>
    <p className="player-performance-detail__period-label">{periodLabel}</p>

    <div className="period-controls">
      <div className="period-tabs">{(["all","year","month"] as const).map(value=><button key={value} type="button" className={period===value?"tag-toggle tag-toggle--active":"tag-toggle"} onClick={()=>setPeriod(value)}>{value==="all"?"通算":value==="year"?"年間":"月間"}</button>)}</div>
      {period!=="all"?<div className="period-selectors"><select aria-label="個人成績の年" value={year} onChange={event=>setYear(Number(event.target.value))}>{Array.from({length:6},(_,index)=>new Date().getFullYear()-index).map(value=><option key={value} value={value}>{value}年</option>)}</select>{period==="month"?<select aria-label="個人成績の月" value={month} onChange={event=>setMonth(Number(event.target.value))}>{Array.from({length:12},(_,index)=>index+1).map(value=><option key={value} value={value}>{value}月</option>)}</select>:null}</div>:null}
    </div>

    {isLoading&&!aggregate?<p className="empty-hint">個人成績を読み込んでいます…</p>:loadFailed?<div className="read-retry"><p className="empty-hint">個人成績を読み込めませんでした。</p><Button variant="secondary" onClick={()=>setReloadToken(value=>value+1)}>再読み込み</Button></div>:aggregate&&metrics?<>
      <div className="player-performance-detail__summary" aria-label="個人成績サマリー">
        <div><span>最終pt</span><strong className={numberClass(aggregate.finalPointTotal)}>{formatScore(aggregate.finalPointTotal)}</strong></div>
        <div><span>麻雀pt</span><strong className={numberClass(aggregate.mahjongPointTotal)}>{formatScore(aggregate.mahjongPointTotal)}</strong></div>
        <div><span>チップ</span><strong className={numberClass(aggregate.chipCountTotal)}>{formatScore(aggregate.chipCountTotal)}枚</strong></div>
        <div><span>チップ換算</span><strong className={numberClass(aggregate.chipPointTotal)}>{formatScore(aggregate.chipPointTotal)}pt</strong></div>
      </div>

      <div className="player-performance-detail__counts">
        <span>半荘 <strong>{aggregate.gameCount}</strong></span>
        <span>Session <strong>{aggregate.sessionCount}</strong></span>
      </div>

      <div className="player-performance-detail__metrics">
        <div><span>平均pt</span><strong className={numberClass(metrics.averageScorePoint)}>{formatDecimal(metrics.averageScorePoint)}</strong></div>
        <div><span>平均順位</span><strong>{aggregate.gameCount===0?"—":`${metrics.averagePlacement.toFixed(2)}位`}</strong></div>
        <div><span>半荘勝率</span><strong>{formatPercent(metrics.gameWinRate)}</strong><small>{aggregate.firstPlaceCount}/{aggregate.gameCount}</small></div>
        <div><span>ラス率</span><strong>{formatPercent(metrics.lastPlaceRate)}</strong><small>{aggregate.lastPlaceCount}/{aggregate.gameCount}</small></div>
        <div><span>Session勝率</span><strong>{formatPercent(metrics.sessionWinRate)}</strong><small>{aggregate.sessionFirstPlaceCount}/{aggregate.sessionCount}</small></div>
      </div>

      <section className="player-performance-detail__distribution" aria-labelledby="placement-distribution-title">
        <div className="player-performance-detail__section-head"><div><p className="screen-eyebrow">PLACEMENT</p><h2 id="placement-distribution-title">順位分布</h2></div><span>{aggregate.gameCount}半荘</span></div>
        {aggregate.gameCount===0?<p className="empty-hint">この期間の半荘データはありません。</p>:<div className="player-performance-detail__distribution-body">
          <div className="placement-donut" role="img" aria-label={`順位分布。${metrics.placements.map(item=>`${item.placement}位${item.count}回`).join("、")}`} style={{background:donutBackground}}><div className="placement-donut__center"><strong>{aggregate.gameCount}</strong><span>半荘</span></div></div>
          <div className="placement-legend">{metrics.placements.map(item=><div className="placement-legend__row" key={item.placement}><span className={`placement-legend__dot placement-legend__dot--${item.placement}`} aria-hidden="true"/><strong>{item.placement}位</strong><span>{item.count}回</span><span>{formatPercent(item.rate)}</span></div>)}</div>
        </div>}
      </section>
    </>:null}
  </section>;
}
