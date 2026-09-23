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
