import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  validateChipResults,
  validateGameResults,
  validateParticipantSegment,
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
    assert.ok(result.issues.some((issue) => issue.code === "duplicate_participant"));
  }
});

test("game results accept three unique players including negative integer score", () => {
  const results: readonly GameResult[] = [
    { playerId: "p1", scorePoint: 25 },
    { playerId: "p2", scorePoint: 1 },
    { playerId: "p3", scorePoint: -26 },
  ];

  assert.equal(validateGameResults(results).valid, true);
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

test("game results reject extreme score values even when balanced", () => {
  const result = validateGameResults([
    { playerId: "p1", scorePoint: 1_000_001 },
    { playerId: "p2", scorePoint: -1_000_000 },
    { playerId: "p3", scorePoint: -1 },
  ]);
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.issues.some((issue) => issue.code === "game_score_out_of_range"));
});

test("chip results reject extreme counts even when balanced", () => {
  const result = validateChipResults([
    { playerId: "p1", chipCount: 10_001 },
    { playerId: "p2", chipCount: -10_000 },
    { playerId: "p3", chipCount: -1 },
  ]);
  assert.equal(result.valid, false);
  if (!result.valid) assert.ok(result.issues.some((issue) => issue.code === "chip_count_out_of_range"));
});
