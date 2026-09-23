import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Clock, IdGenerator } from "../src/application/ports";
import {
  AddPlayerToGroupUseCase,
  CreateGroupUseCase,
  ExportBackupUseCase,
  ImportBackupUseCase,
  StartSessionUseCase,
} from "../src/application/use-cases";
import type { AppDataSchema } from "../src/domain";
import {
  LocalStorageGroupRepository,
  LocalStoragePlayerRepository,
  LocalStorageSessionRepository,
} from "../src/infrastructure/repositories";
import {
  APP_DATA_STORAGE_KEY,
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

class FixedClock implements Clock {
  constructor(private readonly value: string) {}

  now(): string {
    return this.value;
  }
}

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error("No ID left in SequenceIdGenerator.");
    }
    this.index += 1;
    return value;
  }
}

const createFixture = () => {
  const keyValueStore = new MemoryKeyValueStore();
  const store = new LocalStorageAppDataStore(keyValueStore);
  const groups = new LocalStorageGroupRepository(store);
  const players = new LocalStoragePlayerRepository(store);
  const sessions = new LocalStorageSessionRepository(store);

  return { keyValueStore, store, groups, players, sessions };
};

test("schema validation rejects unknown root fields", () => {
  const value = {
    ...createEmptyAppData(),
    unexpected: true,
  };

  const result = validateAppDataSchema(value);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "storage_schema_invalid");
  }
});

test("local storage adapter round-trips schema v2", async () => {
  const { keyValueStore, store } = createFixture();
  const data: AppDataSchema = {
    ...createEmptyAppData(),
    groups: [
      {
        id: "g1",
        name: "三麻会",
        createdAt: "2026-09-23T00:00:00.000Z",
        updatedAt: "2026-09-23T00:00:00.000Z",
      },
    ],
  };

  const saved = await store.replace(data);
  assert.equal(saved.ok, true);
  assert.ok(keyValueStore.getItem(APP_DATA_STORAGE_KEY));

  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.schemaVersion, 2);
    assert.equal(loaded.value.groups[0]?.name, "三麻会");
  }
});

test("create group and add player persist compound membership atomically", async () => {
  const { store, groups, players } = createFixture();
  const clock = new FixedClock("2026-09-23T00:00:00.000Z");
  const ids = new SequenceIdGenerator(["group-1", "player-1"]);

  const groupResult = await new CreateGroupUseCase(groups, ids, clock).execute({
    name: "  三麻会  ",
  });

  assert.equal(groupResult.ok, true);
  if (!groupResult.ok) return;
  assert.equal(groupResult.value.name, "三麻会");

  const playerResult = await new AddPlayerToGroupUseCase(
    players,
    ids,
    clock,
  ).execute({
    groupId: groupResult.value.id,
    displayName: "A",
  });

  assert.equal(playerResult.ok, true);

  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.players.length, 1);
    assert.deepEqual(loaded.value.groupMembers, [
      { groupId: "group-1", playerId: "player-1", active: true },
    ]);
  }
});

test("start session persists session and initial segment in one store update", async () => {
  const { store, groups, players, sessions } = createFixture();
  const clock = new FixedClock("2026-09-23T01:23:45.000Z");
  const groupIds = new SequenceIdGenerator(["group-1"]);

  const group = await new CreateGroupUseCase(groups, groupIds, clock).execute({
    name: "三麻会",
  });
  assert.equal(group.ok, true);
  if (!group.ok) return;

  const playerIds = new SequenceIdGenerator(["p1", "p2", "p3"]);
  const addPlayer = new AddPlayerToGroupUseCase(players, playerIds, clock);

  for (const displayName of ["A", "B", "C"]) {
    const result = await addPlayer.execute({
      groupId: group.value.id,
      displayName,
    });
    assert.equal(result.ok, true);
  }

  const sessionIds = new SequenceIdGenerator(["session-1", "segment-1"]);
  const started = await new StartSessionUseCase(
    sessions,
    players,
    sessionIds,
    clock,
  ).execute({
    groupId: group.value.id,
    sessionDate: "2026-09-23",
    participantPlayerIds: ["p1", "p2", "p3"],
  });

  assert.equal(started.ok, true);

  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.sessions.length, 1);
    assert.equal(loaded.value.participantSegments.length, 1);
    assert.deepEqual(
      loaded.value.participantSegments[0]?.participantPlayerIds,
      ["p1", "p2", "p3"],
    );
  }
});

test("invalid start session does not create partial session data", async () => {
  const { store, groups, players, sessions } = createFixture();
  const clock = new FixedClock("2026-09-23T01:23:45.000Z");

  const group = await new CreateGroupUseCase(
    groups,
    new SequenceIdGenerator(["group-1"]),
    clock,
  ).execute({ name: "三麻会" });

  assert.equal(group.ok, true);
  if (!group.ok) return;

  const playerIds = new SequenceIdGenerator(["p1", "p2"]);
  const addPlayer = new AddPlayerToGroupUseCase(players, playerIds, clock);

  for (const displayName of ["A", "B"]) {
    assert.equal(
      (
        await addPlayer.execute({
          groupId: group.value.id,
          displayName,
        })
      ).ok,
      true,
    );
  }

  const result = await new StartSessionUseCase(
    sessions,
    players,
    new SequenceIdGenerator(["session-1", "segment-1"]),
    clock,
  ).execute({
    groupId: group.value.id,
    sessionDate: "2026-09-23",
    participantPlayerIds: ["p1", "p2"],
  });

  assert.equal(result.ok, false);

  const loaded = await store.load();
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.value.sessions.length, 0);
    assert.equal(loaded.value.participantSegments.length, 0);
  }
});

test("backup export/import restores data and invalid import preserves existing data", async () => {
  const source = createFixture();
  const clock = new FixedClock("2026-09-23T02:00:00.000Z");

  const created = await new CreateGroupUseCase(
    source.groups,
    new SequenceIdGenerator(["source-group"]),
    clock,
  ).execute({ name: "Source" });

  assert.equal(created.ok, true);

  const exported = await new ExportBackupUseCase(
    source.store,
    clock,
    "0.1.0",
  ).execute();

  assert.equal(exported.ok, true);
  if (!exported.ok) return;

  const destination = createFixture();
  const imported = await new ImportBackupUseCase(destination.store).execute(
    exported.value,
  );

  assert.equal(imported.ok, true);

  const restored = await destination.store.load();
  assert.equal(restored.ok, true);
  if (restored.ok) {
    assert.equal(restored.value.groups[0]?.name, "Source");
  }

  const beforeInvalidImport = destination.keyValueStore.getItem(
    APP_DATA_STORAGE_KEY,
  );

  const invalidBackup = JSON.stringify({
    fileVersion: 1,
    exportedAt: "2026-09-23T02:00:00.000Z",
    appVersion: "0.1.0",
    data: { ...createEmptyAppData(), schemaVersion: 999 },
  });

  const invalid = await new ImportBackupUseCase(destination.store).execute(
    invalidBackup,
  );

  assert.equal(invalid.ok, false);
  assert.equal(
    destination.keyValueStore.getItem(APP_DATA_STORAGE_KEY),
    beforeInvalidImport,
  );
});
