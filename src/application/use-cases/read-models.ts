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
