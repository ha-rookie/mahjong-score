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

test("game results accept three unique players including negative final points", () => {
  const results: readonly GameResult[] = [
    { playerId: "p1", finalPoints: 65000, mahjongScore: 25 },
    { playerId: "p2", finalPoints: 41000, mahjongScore: 1 },
    { playerId: "p3", finalPoints: -1000, mahjongScore: -26 },
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
