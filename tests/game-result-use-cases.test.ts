import { strict as assert } from "node:assert";
import { test } from "node:test";
import type {
  Clock,
  GameRepository,
  IdGenerator,
  SessionRepository,
} from "../src/application/ports";
import {
  AddGameResultUseCase,
  ListGamesBySessionUseCase,
} from "../src/application/use-cases";
import type {
  Game,
  GameId,
  ParticipantSegment,
  SegmentId,
  Session,
  SessionId,
} from "../src/domain";
import { ok, type Result } from "../src/shared/errors";

const session: Session = {
  id: "s1", groupId: "g1", sessionDate: "2026-09-23",
  startedAt: "2026-09-23T05:00:00.000Z", endedAt: null,
  status: "active", note: null, participantNotes: [], chipResults: [],
};
const segment: ParticipantSegment = {
  id: "seg1", sessionId: "s1", sequence: 1,
  participantPlayerIds: ["p1", "p2", "p3"],
};

class FakeSessionRepository implements SessionRepository {
  findById(id: SessionId): Promise<Result<Session | null>> {
    return Promise.resolve(ok(id === session.id ? session : null));
  }
  listSegments(): Promise<Result<readonly ParticipantSegment[]>> {
    return Promise.resolve(ok([segment]));
  }
  listByGroup(): Promise<Result<readonly Session[]>> { return Promise.resolve(ok([session])); }
  createWithInitialSegment(): Promise<Result<void>> { return Promise.resolve(ok(undefined)); }
  save(): Promise<Result<void>> { return Promise.resolve(ok(undefined)); }
  remove(): Promise<Result<void>> { return Promise.resolve(ok(undefined)); }
  cancelEmpty(): Promise<Result<void>> { return Promise.resolve(ok(undefined)); }
  saveSegment(): Promise<Result<void>> { return Promise.resolve(ok(undefined)); }
  findSegmentById(id: SegmentId): Promise<Result<ParticipantSegment | null>> {
    return Promise.resolve(ok(id === segment.id ? segment : null));
  }
}

class FakeGameRepository implements GameRepository {
  readonly games: Game[] = [];
  listBySession(sessionId: SessionId): Promise<Result<readonly Game[]>> {
    return Promise.resolve(ok(this.games.filter((game) => game.sessionId === sessionId)));
  }
  findById(id: GameId): Promise<Result<Game | null>> {
    return Promise.resolve(ok(this.games.find((game) => game.id === id) ?? null));
  }
  save(game: Game): Promise<Result<void>> {
    const index = this.games.findIndex((item) => item.id === game.id);
    if (index >= 0) this.games[index] = game;
    else this.games.push(game);
    return Promise.resolve(ok(undefined));
  }
  removeBySession(sessionId: SessionId): Promise<Result<void>> {
    for (let i=this.games.length-1;i>=0;i-=1) if(this.games[i]?.sessionId===sessionId)this.games.splice(i,1);
    return Promise.resolve(ok(undefined));
  }
  remove(id: GameId): Promise<Result<void>> {
    const index = this.games.findIndex((item) => item.id === id);
    if (index >= 0) this.games.splice(index, 1);
    return Promise.resolve(ok(undefined));
  }
}

class FixedClock implements Clock {
  now(): string { return "2026-09-23T06:00:00.000Z"; }
}
class SequenceIds implements IdGenerator {
  private index = 0;
  generate(): string { this.index += 1; return "game-" + this.index; }
}

test("add game result calculates the one omitted score and increments sequence", async () => {
  const games = new FakeGameRepository();
  games.games.push({
    id: "old", sessionId: "s1", segmentId: "seg1", sequence: 2,
    playedAt: "2026-09-23T05:30:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 4 },
      { playerId: "p2", scorePoint: 1 },
      { playerId: "p3", scorePoint: -5 },
    ],
    tags: [],
  });

  const useCase = new AddGameResultUseCase(
    games, new FakeSessionRepository(), new SequenceIds(), new FixedClock(),
  );
  const result = await useCase.execute({
    sessionId: "s1",
    scorePointsByPlayer: { p1: 2, p2: null, p3: -7 },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.sequence, 3);
  assert.equal(result.value.segmentId, "seg1");
  assert.deepEqual(result.value.results, [
    { playerId: "p1", scorePoint: 2 },
    { playerId: "p2", scorePoint: 5 },
    { playerId: "p3", scorePoint: -7 },
  ]);
});

test("add game result rejects score-sheet players that do not match current participants", async () => {
  const games = new FakeGameRepository();
  const result = await new AddGameResultUseCase(
    games, new FakeSessionRepository(), new SequenceIds(), new FixedClock(),
  ).execute({
    sessionId: "s1",
    scorePointsByPlayer: { p1: 2, p2: null, other: -7 },
  });

  assert.equal(result.ok, false);
  assert.equal(games.games.length, 0);
  if (!result.ok) assert.equal(result.error.code, "game_score_players_invalid");
});

test("list games by session delegates to repository", async () => {
  const games = new FakeGameRepository();
  games.games.push({
    id: "g1", sessionId: "s1", segmentId: "seg1", sequence: 1,
    playedAt: "2026-09-23T05:30:00.000Z",
    results: [
      { playerId: "p1", scorePoint: 4 },
      { playerId: "p2", scorePoint: 1 },
      { playerId: "p3", scorePoint: -5 },
    ],
    tags: [],
  });
  const result = await new ListGamesBySessionUseCase(games).execute("s1");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.length, 1);
});
