import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  GroupRepository,
  PlayerRepository,
  SessionRepository,
} from "../src/application/ports";
import {
  GetActiveSessionUseCase,
  ListGroupsUseCase,
  ListPlayersByGroupUseCase,
} from "../src/application/use-cases";
import type {
  Group,
  GroupId,
  ParticipantSegment,
  Player,
  PlayerId,
  SegmentId,
  Session,
  SessionId,
} from "../src/domain";
import { ok, type Result } from "../src/shared/errors";

const group: Group = {
  id: "g1",
  name: "三麻会",
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};

const players: readonly Player[] = [
  {
    id: "p1",
    displayName: "A",
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "p2",
    displayName: "B",
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  },
  {
    id: "p3",
    displayName: "C",
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  },
];

class FakeGroupRepository implements GroupRepository {
  list(): Promise<Result<readonly Group[]>> {
    return Promise.resolve(ok([group]));
  }

  findById(id: GroupId): Promise<Result<Group | null>> {
    return Promise.resolve(ok(id === group.id ? group : null));
  }

  save(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }
}

class FakePlayerRepository implements PlayerRepository {
  listByGroup(): Promise<Result<readonly Player[]>> {
    return Promise.resolve(ok(players));
  }

  findById(id: PlayerId): Promise<Result<Player | null>> {
    return Promise.resolve(ok(players.find((player) => player.id === id) ?? null));
  }

  createForGroup(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  save(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }
}

const activeSession: Session = {
  id: "s1",
  groupId: "g1",
  sessionDate: "2026-09-23",
  startedAt: "2026-09-23T01:00:00.000Z",
  endedAt: null,
  status: "active",
  note: null,
  participantNotes: [],
  chipResults: [],
};

const currentSegment: ParticipantSegment = {
  id: "seg2",
  sessionId: "s1",
  sequence: 2,
  participantPlayerIds: ["p1", "p2", "p3"],
};

class FakeSessionRepository implements SessionRepository {
  listByGroup(): Promise<Result<readonly Session[]>> {
    return Promise.resolve(ok([activeSession]));
  }

  findById(id: SessionId): Promise<Result<Session | null>> {
    return Promise.resolve(ok(id === activeSession.id ? activeSession : null));
  }

  listSegments(): Promise<Result<readonly ParticipantSegment[]>> {
    return Promise.resolve(
      ok([
        {
          ...currentSegment,
          id: "seg1",
          sequence: 1,
          participantPlayerIds: ["p1", "p2", "p3"],
        },
        currentSegment,
      ]),
    );
  }

  createWithInitialSegment(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  save(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  saveSegment(): Promise<Result<void>> {
    return Promise.resolve(ok(undefined));
  }

  findSegmentById(id: SegmentId): Promise<Result<ParticipantSegment | null>> {
    return Promise.resolve(ok(id === currentSegment.id ? currentSegment : null));
  }
}

test("list query use cases return groups and group players", async () => {
  const groups = await new ListGroupsUseCase(new FakeGroupRepository()).execute();
  const listedPlayers = await new ListPlayersByGroupUseCase(
    new FakePlayerRepository(),
  ).execute(group.id);

  assert.equal(groups.ok, true);
  assert.equal(listedPlayers.ok, true);

  if (groups.ok && listedPlayers.ok) {
    assert.equal(groups.value[0]?.name, "三麻会");
    assert.deepEqual(
      listedPlayers.value.map((player) => player.displayName),
      ["A", "B", "C"],
    );
  }
});

test("active session query returns latest participant segment", async () => {
  const result = await new GetActiveSessionUseCase(
    new FakeSessionRepository(),
  ).execute(group.id);

  assert.equal(result.ok, true);

  if (result.ok) {
    assert.equal(result.value?.session.id, "s1");
    assert.deepEqual(result.value?.participantPlayerIds, ["p1", "p2", "p3"]);
  }
});
