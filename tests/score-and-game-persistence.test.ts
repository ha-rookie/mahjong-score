import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { AppDataSchema, Game } from "../src/domain";
import {
  LocalStorageGameRepository,
} from "../src/infrastructure/repositories";
import {
  APP_DATA_STORAGE_KEY,
  LEGACY_APP_DATA_STORAGE_KEY,
  LocalStorageAppDataStore,
  createEmptyAppData,
} from "../src/infrastructure/storage";
import type { KeyValueStore } from "../src/shared/storage";

class MemoryKeyValueStore implements KeyValueStore {
  readonly values = new Map<string, string>();

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

const createStore = () => {
  const storage = new MemoryKeyValueStore();
  const store = new LocalStorageAppDataStore(storage);
  return { storage, store };
};

const createGameFixtureData = (): AppDataSchema => ({
  ...createEmptyAppData(),
  groups: [
    {
      id: "g1",
      name: "三麻会",
      createdAt: "2026-09-23T00:00:00.000Z",
      updatedAt: "2026-09-23T00:00:00.000Z",
    },
  ],
  sessions: [
    {
      id: "s1",
      groupId: "g1",
      sessionDate: "2026-09-23",
      startedAt: "2026-09-23T01:00:00.000Z",
      endedAt: null,
      status: "active",
      note: null,
      participantNotes: [],
      chipResults: [],
    },
  ],
  participantSegments: [
    {
      id: "seg1",
      sessionId: "s1",
      sequence: 1,
      participantPlayerIds: ["p1", "p2", "p3"],
    },
  ],
});

test("legacy schema v1 without games migrates to v2 and preserves data", async () => {
  const { storage, store } = createStore();
  const legacy = {
    ...createGameFixtureData(),
    schemaVersion: 1,
    games: [],
  };

  storage.setItem(LEGACY_APP_DATA_STORAGE_KEY, JSON.stringify(legacy));

  const loaded = await store.load();

  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.schemaVersion, 2);
    assert.equal(loaded.value.groups[0]?.name, "三麻会");
    assert.equal(loaded.value.sessions[0]?.id, "s1");
    assert.equal(loaded.value.participantSegments[0]?.id, "seg1");
  }

  const currentRaw = storage.getItem(APP_DATA_STORAGE_KEY);
  assert.ok(currentRaw);
  assert.ok(storage.getItem(LEGACY_APP_DATA_STORAGE_KEY));

  const current = JSON.parse(currentRaw as string) as { schemaVersion: number };
  assert.equal(current.schemaVersion, 2);
});

test("legacy schema v1 with games refuses automatic migration", async () => {
  const { storage, store } = createStore();
  const legacy = {
    ...createGameFixtureData(),
    schemaVersion: 1,
    games: [
      {
        id: "legacy-game",
        sessionId: "s1",
        segmentId: "seg1",
        sequence: 1,
        playedAt: "2026-09-23T02:00:00.000Z",
        results: [
          { playerId: "p1", finalPoints: 50000, mahjongScore: 10 },
          { playerId: "p2", finalPoints: 40000, mahjongScore: 0 },
          { playerId: "p3", finalPoints: 15000, mahjongScore: -10 },
        ],
        tags: [],
      },
    ],
  };

  storage.setItem(LEGACY_APP_DATA_STORAGE_KEY, JSON.stringify(legacy));

  const loaded = await store.load();

  assert.equal(loaded.ok, false);
  if (!loaded.ok) {
    assert.equal(loaded.error.code, "storage_migration_manual_required");
  }
  assert.equal(storage.getItem(APP_DATA_STORAGE_KEY), null);
});

test("game repository saves, finds, and lists validated games", async () => {
  const { store } = createStore();
  const seeded = await store.replace(createGameFixtureData());
  assert.equal(seeded.ok, true);

  const games = new LocalStorageGameRepository(store);
  const game: Game = {
    id: "game-1",
    sessionId: "s1",
    segmentId: "seg1",
    sequence: 1,
    playedAt: "2026-09-23T02:00:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 5 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p3", scorePoint: -8 },
    ],
    tags: [],
  };

  assert.equal((await games.save(game)).ok, true);

  const found = await games.findById("game-1");
  assert.equal(found.ok, true);
  if (found.ok) {
    assert.deepEqual(found.value?.results, game.results);
  }

  const listed = await games.listBySession("s1");
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0]?.id, "game-1");
  }
});

test("game repository rejects players outside participant segment", async () => {
  const { store } = createStore();
  assert.equal((await store.replace(createGameFixtureData())).ok, true);

  const games = new LocalStorageGameRepository(store);
  const invalid: Game = {
    id: "game-1",
    sessionId: "s1",
    segmentId: "seg1",
    sequence: 1,
    playedAt: "2026-09-23T02:00:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 5 },
      { playerId: "p2", scorePoint: 3 },
      { playerId: "p4", scorePoint: -8 },
    ],
    tags: [],
  };

  const result = await games.save(invalid);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "game_invalid");
  }
});
