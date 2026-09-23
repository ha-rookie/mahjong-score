import type {
  Game,
  GroupId,
  Player,
  PlayerId,
  Session,
  SessionId,
} from "../../domain";
import { ok, type Result } from "../../shared/errors";
import type {
  GameRepository,
  GroupRepository,
  PlayerRepository,
  SessionRepository,
} from "../ports";

export class ListGroupsUseCase {
  constructor(private readonly groups: GroupRepository) {}
  execute() { return this.groups.list(); }
}

export class ListPlayersByGroupUseCase {
  constructor(private readonly players: PlayerRepository) {}
  execute(groupId: GroupId): Promise<Result<readonly Player[]>> {
    return this.players.listByGroup(groupId);
  }
}

export interface ActiveSessionSummary {
  readonly session: Session;
  readonly participantPlayerIds: readonly PlayerId[];
}

export class GetActiveSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(groupId: GroupId): Promise<Result<ActiveSessionSummary | null>> {
    const listed = await this.sessions.listByGroup(groupId);
    if (!listed.ok) return listed;

    const active = [...listed.value]
      .filter((session) => session.status === "active")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

    if (active === undefined) return ok(null);

    const segments = await this.sessions.listSegments(active.id);
    if (!segments.ok) return segments;

    const currentSegment = [...segments.value].sort(
      (a, b) => b.sequence - a.sequence,
    )[0];

    return ok({
      session: active,
      participantPlayerIds: currentSegment?.participantPlayerIds ?? [],
    });
  }
}

export class ListGamesBySessionUseCase {
  constructor(private readonly games: GameRepository) {}

  execute(sessionId: SessionId): Promise<Result<readonly Game[]>> {
    return this.games.listBySession(sessionId);
  }
}


export interface SessionResultsSummary {
  readonly session: Session;
  readonly participantPlayerIds: readonly PlayerId[];
  readonly games: readonly Game[];
}

export class GetSessionResultsUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly games: GameRepository,
  ) {}

  async execute(sessionId: SessionId): Promise<Result<SessionResultsSummary | null>> {
    const session = await this.sessions.findById(sessionId);
    if (!session.ok) return session;
    if (session.value === null) return ok(null);

    const segments = await this.sessions.listSegments(sessionId);
    if (!segments.ok) return segments;
    const firstSegment = [...segments.value].sort((a,b)=>a.sequence-b.sequence)[0];
    if (firstSegment === undefined) return ok(null);

    const games = await this.games.listBySession(sessionId);
    if (!games.ok) return games;

    return ok({ session: session.value, participantPlayerIds: firstSegment.participantPlayerIds, games: games.value });
  }
}

export class ListFinalizedSessionsUseCase {
  constructor(private readonly sessions: SessionRepository) {}
  async execute(groupId: GroupId): Promise<Result<readonly Session[]>> {
    const listed = await this.sessions.listByGroup(groupId);
    if (!listed.ok) return listed;
    return ok([...listed.value].filter(x=>x.status==="finalized").sort((a,b)=>(b.endedAt??b.startedAt).localeCompare(a.endedAt??a.startedAt)));
  }
}

export interface PlayerPerformanceAggregate {
  readonly playerId: PlayerId;
  readonly sessionCount: number;
  readonly gameCount: number;
  readonly mahjongPointTotal: number;
  readonly finalPointTotal: number;
  readonly firstPlaceCount: number;
}

export class GetPlayerPerformanceAggregatesUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly games: GameRepository,
  ) {}

  async execute(groupId: GroupId): Promise<Result<readonly PlayerPerformanceAggregate[]>> {
    const listed = await this.sessions.listByGroup(groupId);
    if (!listed.ok) return listed;
    const finalized = listed.value.filter(s=>s.status==="finalized");
    const aggregates = new Map<PlayerId, {sessionCount:number;gameCount:number;mahjongPointTotal:number;finalPointTotal:number;firstPlaceCount:number}>();

    for (const session of finalized) {
      const segments = await this.sessions.listSegments(session.id);
      if (!segments.ok) return segments;
      const participantIds = [...new Set(segments.value.flatMap(s=>s.participantPlayerIds))];
      const sessionGames = await this.games.listBySession(session.id);
      if (!sessionGames.ok) return sessionGames;
      const mahjong = new Map<PlayerId,number>();
      const gameCounts = new Map<PlayerId,number>();
      for (const game of sessionGames.value) for (const result of game.results) {
        mahjong.set(result.playerId,(mahjong.get(result.playerId)??0)+result.scorePoint);
        gameCounts.set(result.playerId,(gameCounts.get(result.playerId)??0)+1);
      }
      const chip = (id:PlayerId)=>session.chipResults.find(x=>x.playerId===id)?.chipCount??0;
      const final = (id:PlayerId)=>(mahjong.get(id)??0)+chip(id)*5;
      const best = participantIds.length ? Math.max(...participantIds.map(final)) : null;
      for (const id of participantIds) {
        const a=aggregates.get(id)??{sessionCount:0,gameCount:0,mahjongPointTotal:0,finalPointTotal:0,firstPlaceCount:0};
        a.sessionCount+=1;a.gameCount+=gameCounts.get(id)??0;a.mahjongPointTotal+=mahjong.get(id)??0;a.finalPointTotal+=final(id);if(best!==null&&final(id)===best)a.firstPlaceCount+=1;
        aggregates.set(id,a);
      }
    }
    return ok([...aggregates].map(([playerId,a])=>({playerId,...a})).sort((a,b)=>b.finalPointTotal-a.finalPointTotal));
  }
}
