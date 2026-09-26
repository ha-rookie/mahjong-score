import type {
  Clock,
  IdGenerator,
  PlayerRepository,
  SessionRepository,
} from "../ports";
import type {
  GroupId,
  MahjongRules,
  ParticipantSegment,
  PlayerId,
  Session,
} from "../../domain";
import { validateParticipantSegment } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export interface StartSessionInput {
  readonly groupId: GroupId;
  readonly sessionDate: string;
  readonly participantPlayerIds: readonly PlayerId[];
  readonly rules: MahjongRules;
}

const isIsoDate = (value: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export class StartSessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly players: PlayerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: StartSessionInput): Promise<Result<Session>> {
    if (!isIsoDate(input.sessionDate)) {
      return err(
        new AppError({
          code: "session_date_invalid",
          message: `Invalid session date: ${input.sessionDate}`,
          userMessage: "日付を確認してください。",
        }),
      );
    }

    const activePlayers = await this.players.listByGroup(input.groupId);

    if (!activePlayers.ok) {
      return activePlayers;
    }

    const activeIds = new Set(activePlayers.value.map((player) => player.id));
    const missing = input.participantPlayerIds.filter(
      (playerId) => !activeIds.has(playerId),
    );

    if (missing.length > 0) {
      return err(
        new AppError({
          code: "session_participant_not_in_group",
          message: `Participants are not active group members: ${missing.join(",")}`,
          userMessage: "参加者の登録状態を確認してください。",
        }),
      );
    }

    const sessionId = this.ids.generate();
    const segment: ParticipantSegment = {
      id: this.ids.generate(),
      sessionId,
      sequence: 1,
      participantPlayerIds: [...input.participantPlayerIds],
    };

    const validation = validateParticipantSegment(segment);

    if (!validation.valid) {
      return err(
        new AppError({
          code: "session_participants_invalid",
          message: validation.issues.map((issue) => issue.message).join(" / "),
          userMessage: "参加者を確認してください。",
        }),
      );
    }

    const session: Session = {
      id: sessionId,
      groupId: input.groupId,
      sessionDate: input.sessionDate,
      startedAt: this.clock.now(),
      endedAt: null,
      status: "active",
      note: null,
      participantNotes: [],
      chipResults: [],
      ...input.rules,
    };

    const saved = await this.sessions.createWithInitialSegment(session, segment);
    return saved.ok ? { ok: true, value: session } : saved;
  }
}
