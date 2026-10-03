import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Game, Player, Session } from "../src/domain";
import {
  buildSessionShareClipboardText,
  buildSessionShareSummary,
  buildSessionShareText,
  normalizeAppTopUrl,
} from "../src/shared/session-result-share";

const players = (names: readonly string[]): Player[] => names.map((displayName,index)=>({
  id:`p${index+1}`,
  displayName,
  createdAt:"2026-09-01T00:00:00.000Z",
  updatedAt:"2026-09-01T00:00:00.000Z",
}));

const session = (chipResults: Session["chipResults"]=[]): Session => ({
  id:"session-secret-id",
  groupId:"group-secret-id",
  sessionDate:"2026-09-30",
  startedAt:"2026-09-30T10:00:00.000Z",
  endedAt:"2026-09-30T15:00:00.000Z",
  status:"finalized",
  note:"このメモは共有しない",
  participantNotes:[],
  chipResults,
  chipRate:5,
});

const game = (sequence:number,scores:readonly number[]):Game=>({
  id:`g${sequence}`,
  sessionId:"session-secret-id",
  segmentId:"segment-1",
  sequence,
  playedAt:`2026-09-30T${String(sequence+10).padStart(2,"0")}:00:00.000Z`,
  results:scores.map((scorePoint,index)=>({playerId:`p${index+1}`,scorePoint})),
  tags:[],
});

test("builds three-player share summary from final Session points",()=>{
  const summary=buildSessionShareSummary(session(),[game(1,[100,-50,-50]),game(2,[108,-32,-76])],players(["田中","石村","山名"]));
  assert.equal(summary.modeLabel,"3人三麻");
  assert.equal(summary.gameCount,2);
  assert.deepEqual(summary.rows.map(row=>({name:row.displayName,point:row.finalPoint,rank:row.rank})),[
    {name:"田中",point:208,rank:1},
    {name:"石村",point:-82,rank:2},
    {name:"山名",point:-126,rank:3},
  ]);
});

test("includes Session chip conversion in final points",()=>{
  const summary=buildSessionShareSummary(session([{playerId:"p1",chipCount:-2},{playerId:"p2",chipCount:1},{playerId:"p3",chipCount:1}]),[game(1,[20,-10,-10])],players(["A","B","C"]));
  assert.deepEqual(summary.rows.map(row=>[row.displayName,row.finalPoint]),[["A",10],["B",-5],["C",-5]]);
  assert.deepEqual(summary.rows.map(row=>row.rank),[1,2,2]);
});

test("formats share text without memo or internal ids",()=>{
  const summary=buildSessionShareSummary(session(),[game(1,[20,-5,-15])],players(["田中","石村","山名"]));
  const text=buildSessionShareText(summary);
  assert.match(text,/🀄 三麻スコア/);
  assert.match(text,/2026-09-30｜3人三麻・1半荘/);
  assert.match(text,/🥇 田中 \+20/);
  assert.match(text,/🥈 石村 -5/);
  assert.match(text,/🥉 山名 -15/);
  assert.match(text,/三麻スコアを開く$/);
  assert.doesNotMatch(text,/このメモは共有しない/);
  assert.doesNotMatch(text,/session-secret-id|group-secret-id/);
});

test("formats fourth place for four-player rotation",()=>{
  const summary=buildSessionShareSummary(session(),[game(1,[40,10,-20,-30])],players(["A","B","C","D"]));
  assert.equal(summary.modeLabel,"4人回し三麻");
  assert.match(buildSessionShareText(summary),/4位 D -30/);
});

test("normalizes top URL and appends it only in clipboard fallback",()=>{
  const summary=buildSessionShareSummary(session(),[game(1,[20,-5,-15])],players(["A","B","C"]));
  const top=normalizeAppTopUrl("https://mahjong.example.com///");
  assert.equal(top,"https://mahjong.example.com/");
  const copied=buildSessionShareClipboardText(summary,top);
  assert.match(copied,/三麻スコアを開く\nhttps:\/\/mahjong\.example\.com\/$/);
  assert.doesNotMatch(copied,/sessions\/session-secret-id/);
});
