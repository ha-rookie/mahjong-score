import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  createRankedGameResults,
  validateGameParticipants,
  validateGameResults,
  type AppDataSchema,
  type Game,
} from "../src/domain";
import { LocalStorageGameRepository } from "../src/infrastructure/repositories";
import {
  LocalStorageAppDataStore,
  createEmptyAppData,
  validateAppDataSchema,
} from "../src/infrastructure/storage";
import type { KeyValueStore } from "../src/shared/storage";

class MemoryKeyValueStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("creates ranked three-player results from two integer score inputs", () => {
  const result = createRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3"],
    lowerRankScorePoints: [3, -8],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, [
    { playerId: "p1", scorePoint: 5 },
    { playerId: "p2", scorePoint: 3 },
    { playerId: "p3", scorePoint: -8 },
  ]);
  assert.equal(
    result.value.reduce((sum, item) => sum + item.scorePoint, 0),
    0,
  );
});

test("creates ranked four-player results and keeps input order even when scores tie", () => {
  const result = createRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3", "p4"],
    lowerRankScorePoints: [10, 10, -30],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, [
    { playerId: "p1", scorePoint: 10 },
    { playerId: "p2", scorePoint: 10 },
    { playerId: "p3", scorePoint: 10 },
    { playerId: "p4", scorePoint: -30 },
  ]);
});

test("rejects non-integer score point input", () => {
  const result = createRankedGameResults({
    rankedPlayerIds: ["p1", "p2", "p3"],
    lowerRankScorePoints: [1.5, -2],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "score_point_not_integer");
  }
});

test("game result validation requires integer values and zero balance", () => {
  assert.equal(
    validateGameResults([
      { playerId: "p1", scorePoint: 20 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p3", scorePoint: -8 },
      { playerId: "p4", scorePoint: -15 },
    ]).valid,
    true,
  );

  const unbalanced = validateGameResults([
    { playerId: "p1", scorePoint: 20 },
    { playerId: "p2", scorePoint: 3 },
    { playerId: "p3", scorePoint: -8 },
    { playerId: "p4", scorePoint: -14 },
  ]);

  assert.equal(unbalanced.valid, false);
  if (!unbalanced.valid) {
    assert.ok(
      unbalanced.issues.some((issue) => issue.code === "game_score_balance"),
    );
  }

  const decimal = validateGameResults([
    { playerId: "p1", scorePoint: 1.5 },
    { playerId: "p2", scorePoint: 0.5 },
    { playerId: "p3", scorePoint: -2 },
  ]);

  assert.equal(decimal.valid, false);
  if (!decimal.valid) {
    assert.ok(
      decimal.issues.some((issue) => issue.code === "game_score_not_integer"),
    );
  }
});

test("game participants must exactly match the segment player set", () => {
  assert.equal(
    validateGameParticipants(
      [
        { playerId: "p1", scorePoint: 5 },
        { playerId: "p2", scorePoint: 3 },
        { playerId: "p3", scorePoint: -8 },
      ],
      ["p1", "p2", "p3"],
    ).valid,
    true,
  );

  assert.equal(
    validateGameParticipants(
      [
        { playerId: "p1", scorePoint: 5 },
        { playerId: "p2", scorePoint: 3 },
        { playerId: "p4", scorePoint: -8 },
      ],
      ["p1", "p2", "p3"],
    ).valid,
    false,
  );
});

test("storage schema accepts scorePoint shape and rejects legacy GameResult shape", () => {
  const base = createEmptyAppData();
  const common = {
    id: "game-1",
    sessionId: "session-1",
    segmentId: "segment-1",
    sequence: 1,
    playedAt: "2026-09-23T05:00:00.000Z",
    tags: [],
  };

  const valid = validateAppDataSchema({
    ...base,
    games: [
      {
        ...common,
        results: [
          { playerId: "p1", scorePoint: 5 },
          { playerId: "p2", scorePoint: 3 },
          { playerId: "p3", scorePoint: -8 },
        ],
      },
    ],
  });

  assert.equal(valid.ok, true);

  const legacy = validateAppDataSchema({
    ...base,
    games: [
      {
        ...common,
        results: [
          { playerId: "p1", finalPoints: 45000, mahjongScore: 5 },
          { playerId: "p2", finalPoints: 43000, mahjongScore: 3 },
          { playerId: "p3", finalPoints: 27000, mahjongScore: -8 },
        ],
      },
    ],
  });

  assert.equal(legacy.ok, false);
});

test("local storage game repository saves a valid game for the exact segment participants", async () => {
  const store = new LocalStorageAppDataStore(new MemoryKeyValueStore());
  const repository = new LocalStorageGameRepository(store);

  const data: AppDataSchema = {
    ...createEmptyAppData(),
    groups: [
      {
        id: "group-1",
        name: "三麻会",
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    sessions: [
      {
        id: "session-1",
        groupId: "group-1",
        sessionDate: "2026-09-23",
        startedAt: "2026-09-23T00:00:00.000Z",
        endedAt: null,
        status: "active",
        note: null,
        participantNotes: [],
        chipResults: [],
      },
    ],
    participantSegments: [
      {
        id: "segment-1",
        sessionId: "session-1",
        sequence: 1,
        participantPlayerIds: ["p1", "p2", "p3"],
      },
    ],
  };

  assert.equal((await store.replace(data)).ok, true);

  const game: Game = {
    id: "game-1",
    sessionId: "session-1",
    segmentId: "segment-1",
    sequence: 1,
    playedAt: "2026-09-23T05:00:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 5 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p3", scorePoint: -8 },
    ],
    tags: [],
  };

  assert.equal((await repository.save(game)).ok, true);

  const listed = await repository.listBySession("session-1");
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.equal(listed.value.length, 1);
    assert.deepEqual(listed.value[0]?.results, game.results);
  }
});

test("local storage game repository rejects participant mismatch without persisting", async () => {
  const store = new LocalStorageAppDataStore(new MemoryKeyValueStore());
  const repository = new LocalStorageGameRepository(store);

  const data: AppDataSchema = {
    ...createEmptyAppData(),
    groups: [
      {
        id: "group-1",
        name: "三麻会",
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
    sessions: [
      {
        id: "session-1",
        groupId: "group-1",
        sessionDate: "2026-09-23",
        startedAt: "2026-09-23T00:00:00.000Z",
        endedAt: null,
        status: "active",
        note: null,
        participantNotes: [],
        chipResults: [],
      },
    ],
    participantSegments: [
      {
        id: "segment-1",
        sessionId: "session-1",
        sequence: 1,
        participantPlayerIds: ["p1", "p2", "p3"],
      },
    ],
  };

  assert.equal((await store.replace(data)).ok, true);

  const invalid: Game = {
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

  const saved = await repository.save(invalid);
  assert.equal(saved.ok, false);

  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.games.length, 0);
  }
});
