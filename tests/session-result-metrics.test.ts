import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateSessionResultMetrics } from "../src/application/use-cases/session-result-metrics";
import type { Game } from "../src/domain";

const game = (sequence: number, scores: readonly number[], placements: readonly number[], lastPlayerIndexes: readonly number[] = []): Game => ({
  id: `game-${sequence}`, sessionId: "session-1", segmentId: "segment-1", sequence,
  playedAt: `2026-09-30T${String(sequence).padStart(2, "0")}:00:00.000Z`,
  results: scores.map((scorePoint, index) => ({ playerId: `p${index + 1}`, scorePoint, placement: placements[index], isLast: lastPlayerIndexes.includes(index) })), tags: [],
});

test("calculates Session average score and win rate from persisted placement", () => {
  const games: readonly Game[] = [game(1,[24,-14,-10],[1,3,2],[1]),game(2,[53,-28,-25],[1,3,2],[1]),game(3,[-38,-4,42],[3,2,1],[0]),game(4,[66,-46,-20],[1,3,2],[1]),game(5,[54,-51,-3],[1,3,2],[1]),game(6,[14,-45,31],[2,3,1],[1])];
  const metrics=calculateSessionResultMetrics(["p1","p2","p3"],games);
  assert.deepEqual(metrics.map(m=>m.scorePointTotal),[173,-188,15]);
  assert.deepEqual(metrics.map(m=>Number(m.averageScorePoint.toFixed(1))),[28.8,-31.3,2.5]);
  assert.deepEqual(metrics.map(m=>m.firstPlaceCount),[4,0,2]);
  assert.deepEqual(metrics.map(m=>Number(m.winRate.toFixed(1))),[66.7,0,33.3]);
});

test("does not infer multiple winners from a tied highest score",()=>{const metrics=calculateSessionResultMetrics(["p1","p2","p3"],[game(1,[10,10,-20],[1,2,3],[2])]);assert.deepEqual(metrics.map(m=>m.firstPlaceCount),[1,0,0]);assert.deepEqual(metrics.map(m=>m.winRate),[100,0,0]);});
test("supports lower-place ties in three- and four-player stored placements",()=>{const a=calculateSessionResultMetrics(["p1","p2","p3"],[game(1,[50,-25,-25],[1,2,2],[1,2])]);const b=calculateSessionResultMetrics(["p1","p2","p3","p4"],[game(2,[50,10,-30,-30],[1,2,3,3],[2,3])]);assert.deepEqual(a.map(m=>m.firstPlaceCount),[1,0,0]);assert.deepEqual(b.map(m=>m.firstPlaceCount),[1,0,0,0]);});
test("does not fall back to scorePoint when legacy result has no placement",()=>{const legacy:Game={...game(1,[30,-10,-20],[1,2,3],[2]),results:[{playerId:"p1",scorePoint:30},{playerId:"p2",scorePoint:-10},{playerId:"p3",scorePoint:-20}]};const metrics=calculateSessionResultMetrics(["p1","p2","p3"],[legacy]);assert.deepEqual(metrics.map(m=>m.firstPlaceCount),[0,0,0]);});
test("returns zero metrics for an empty Session defensively",()=>{const metrics=calculateSessionResultMetrics(["p1","p2","p3"],[]);assert.deepEqual(metrics.map(m=>({average:m.averageScorePoint,wins:m.firstPlaceCount,winRate:m.winRate})),[{average:0,wins:0,winRate:0},{average:0,wins:0,winRate:0},{average:0,wins:0,winRate:0}]);});
