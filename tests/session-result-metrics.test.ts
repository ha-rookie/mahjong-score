import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calculateSessionResultMetrics } from "../src/application/use-cases/session-result-metrics";
import type { Game } from "../src/domain";

const game = (sequence: number, scores: readonly [number, number, number]): Game => ({
  id: `game-${sequence}`,
  sessionId: "session-1",
  segmentId: "segment-1",
  sequence,
  playedAt: `2026-09-30T0${sequence}:00:00.000Z`,
  results: [
    { playerId: "p1", scorePoint: scores[0] },
    { playerId: "p2", scorePoint: scores[1] },
    { playerId: "p3", scorePoint: scores[2] },
  ],
  tags: [],
});

test("calculates Session average score and win rate from Game scorePoint", () => {
  const games: readonly Game[] = [
    game(1, [24, -14, -10]),
    game(2, [53, -28, -25]),
    game(3, [-38, -4, 42]),
    game(4, [66, -46, -20]),
    game(5, [54, -51, -3]),
    game(6, [14, -45, 31]),
  ];

  const metrics = calculateSessionResultMetrics(["p1", "p2", "p3"], games);

  assert.deepEqual(metrics.map((metric) => metric.scorePointTotal), [173, -188, 15]);
  assert.deepEqual(metrics.map((metric) => Number(metric.averageScorePoint.toFixed(1))), [28.8, -31.3, 2.5]);
  assert.deepEqual(metrics.map((metric) => metric.firstPlaceCount), [4, 0, 2]);
  assert.deepEqual(metrics.map((metric) => Number(metric.winRate.toFixed(1))), [66.7, 0, 33.3]);
});

test("counts every tied highest score as first place", () => {
  const tied: Game = game(1, [10, 10, -20]);

  const metrics = calculateSessionResultMetrics(["p1", "p2", "p3"], [tied]);

  assert.deepEqual(metrics.map((metric) => metric.firstPlaceCount), [1, 1, 0]);
  assert.deepEqual(metrics.map((metric) => metric.winRate), [100, 100, 0]);
});

test("returns zero metrics for an empty Session defensively", () => {
  const metrics = calculateSessionResultMetrics(["p1", "p2", "p3"], []);

  assert.deepEqual(metrics.map((metric) => ({
    average: metric.averageScorePoint,
    wins: metric.firstPlaceCount,
    winRate: metric.winRate,
  })), [
    { average: 0, wins: 0, winRate: 0 },
    { average: 0, wins: 0, winRate: 0 },
    { average: 0, wins: 0, winRate: 0 },
  ]);
});
