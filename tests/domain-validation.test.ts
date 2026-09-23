import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  calculateRankedGameResults,
  validateChipResults,
  validateGameAgainstSegment,
  validateGameResults,
  validateParticipantSegment,
  type Game,
  type GameResult,
  type ParticipantSegment,
} from "../src/domain";

test("participant segment accepts three unique players", () => {
  const segment: ParticipantSegment = {
    id: "segment-1",
    sessionId: "session-1",
    sequence: 1,
    participantPlayerIds: ["p1", "p2", "p3"],
  };

  assert.equal(validateParticipantSegment(segment).valid, true);
});

test("participant segment rejects duplicate players", () => {
  const segment: ParticipantSegment = {
    id: "segment-1",
    sessionId: "session-1",
    sequence: 1,
    participantPlayerIds: ["p1", "p1", "p2"],
  };

  const result = validateParticipantSegment(segment);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(
      result.issues.some((issue) => issue.code === "duplicate_participant"),
    );
  }
});

test("ranked score calculation auto-calculates first place for three players", () => {
  const result = calculateRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3"],
    lowerRankScorePoints: [3, -8],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [
      { playerId: "p1", scorePoint: 5 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p3", scorePoint: -8 },
    ]);
  }
});

test("ranked score calculation preserves input rank for four players", () => {
  const result = calculateRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3", "p4"],
    lowerRankScorePoints: [10, 10, -30],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, [
      { playerId: "p1", scorePoint: 10 },
      { playerId: "p2", scorePoint: 10 },
      { playerId: "p3", scorePoint: 10 },
      { playerId: "p4", scorePoint: -30 },
    ]);
  }
});

test("ranked score calculation rejects fractional score points", () => {
  const result = calculateRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3"],
    lowerRankScorePoints: [2.5, -3],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "game_score_not_integer");
  }
});

test("game result validation requires integer scores balanced to zero", () => {
  const validResults: readonly GameResult[] = [
    { playerId: "p1", scorePoint: 5 },
    { playerId: "p2", scorePoint: 3 },
    { playerId: "p3", scorePoint: -8 },
  ];

  assert.equal(validateGameResults(validResults).valid, true);

  const unbalanced = validateGameResults([
    { playerId: "p1", scorePoint: 5 },
    { playerId: "p2", scorePoint: 3 },
    { playerId: "p3", scorePoint: -7 },
  ]);

  assert.equal(unbalanced.valid, false);
  if (!unbalanced.valid) {
    assert.ok(
      unbalanced.issues.some((issue) => issue.code === "game_score_balance"),
    );
  }
});

test("game must contain exactly the participant segment players", () => {
  const segment: ParticipantSegment = {
    id: "segment-1",
    sessionId: "session-1",
    sequence: 1,
    participantPlayerIds: ["p1", "p2", "p3"],
  };

  const game: Game = {
    id: "game-1",
    sessionId: "session-1",
    segmentId: "segment-1",
    sequence: 1,
    playedAt: "2026-09-23T05:00:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 5 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p4", scorePoint: -8 },
    ],
    tags: [],
  };

  const result = validateGameAgainstSegment(game, segment);

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "game_result_players_mismatch",
      ),
    );
  }
});

test("chip results must balance to zero", () => {
  assert.equal(
    validateChipResults([
      { playerId: "p1", chipCount: 2 },
      { playerId: "p2", chipCount: -1 },
      { playerId: "p3", chipCount: -1 },
    ]).valid,
    true,
  );

  const invalid = validateChipResults([
    { playerId: "p1", chipCount: 2 },
    { playerId: "p2", chipCount: -1 },
    { playerId: "p3", chipCount: 0 },
  ]);

  assert.equal(invalid.valid, false);
  if (!invalid.valid) {
    assert.ok(invalid.issues.some((issue) => issue.code === "chip_balance"));
  }
});
