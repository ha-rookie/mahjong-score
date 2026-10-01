import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PlayerPerformanceDetailAggregate } from "../src/application/use-cases/read-models";
import { derivePlayerPerformanceDetailMetrics } from "../src/application/use-cases/player-performance-detail-metrics";

const worker=readFileSync("src/worker.ts","utf8");
const app=readFileSync("src/App.tsx","utf8");
const component=readFileSync("src/components/player-performance-detail.tsx","utf8");
const routeStart=worker.indexOf("const playerPerformanceDetail=");
const routeEnd=worker.indexOf("const activeSession=",routeStart);
const route=routeStart>=0&&routeEnd>routeStart?worker.slice(routeStart,routeEnd):"";

const aggregate:PlayerPerformanceDetailAggregate={
  playerId:"p1" as PlayerPerformanceDetailAggregate["playerId"],
  sessionCount:2,
  gameCount:3,
  mahjongPointTotal:30,
  chipCountTotal:5,
  chipPointTotal:25,
  finalPointTotal:55,
  placementTotal:5,
  firstPlaceCount:1,
  secondPlaceCount:2,
  thirdPlaceCount:0,
  fourthPlaceCount:0,
  lastPlaceCount:2,
  sessionFirstPlaceCount:1,
};

test("detail metrics keep persisted competition placement and last-place semantics",()=>{
  const metrics=derivePlayerPerformanceDetailMetrics(aggregate);
  assert.equal(metrics.averageScorePoint,10);
  assert.equal(metrics.averagePlacement,5/3);
  assert.equal(metrics.gameWinRate,100/3);
  assert.equal(metrics.lastPlaceRate,200/3);
  assert.equal(metrics.sessionWinRate,50);
  assert.deepEqual(metrics.placements.map(item=>item.count),[1,2,0,0]);
});

test("detail API aggregates placement, last and Session-unit chips without N+1",()=>{
  assert.notEqual(route,"");
  assert.match(route,/group_players WHERE group_id=\? AND player_id=\?/);
  assert.match(route,/SUM\(gr\.placement\) AS placementTotal/);
  assert.match(route,/gr\.is_last=1/);
  assert.match(route,/SUM\(chipCount\) AS chipCountTotal/);
  assert.match(route,/SUM\(chipPoint\) AS chipPointTotal/);
  assert.match(route,/WHERE player_id=\? GROUP BY player_id/);
  assert.doesNotMatch(route,/MAX\(gr\.score_point\)/);
});

test("detail is a separate screen and Performance card only links to it",()=>{
  assert.match(app,/view==="player-performance"/);
  assert.match(app,/performance-card__player-link/);
  assert.match(component,/順位分布/);
  assert.match(component,/conic-gradient/);
  assert.match(component,/チップ換算/);
  assert.match(component,/平均順位/);
  assert.match(component,/ラス率/);
});
