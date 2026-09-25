import type { SessionRepository } from "../../application/ports";
import type {
  GroupId,
  ParticipantSegment,
  SegmentId,
  Session,
  SessionId,
} from "../../domain";
import { validateParticipantSegment } from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";
import type { LocalStorageAppDataStore } from "../storage";

export class LocalStorageSessionRepository implements SessionRepository {
  constructor(private readonly store: LocalStorageAppDataStore) {}

  async listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>> {
    const loaded = await this.store.load();
    return loaded.ok
      ? ok(loaded.value.sessions.filter((session) => session.groupId === groupId))
      : loaded;
  }

  async findById(id: SessionId): Promise<Result<Session | null>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(loaded.value.sessions.find((session) => session.id === id) ?? null);
  }

  async listSegments(sessionId: SessionId): Promise<Result<readonly ParticipantSegment[]>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(
      loaded.value.participantSegments
        .filter((segment) => segment.sessionId === sessionId)
        .sort((a, b) => a.sequence - b.sequence),
    );
  }

  async createWithInitialSegment(
    session: Session,
    segment: ParticipantSegment,
  ): Promise<Result<void>> {
    const validation = validateParticipantSegment(segment);

    if (!validation.valid) {
      return err(
        new AppError({
          code: "participant_segment_invalid",
          message: validation.issues.map((issue) => issue.message).join(" / "),
          userMessage: "参加者の構成を確認してください。",
        }),
      );
    }

    if (segment.sessionId !== session.id || segment.sequence !== 1) {
      return err(
        new AppError({
          code: "initial_segment_invalid",
          message: "Initial segment must belong to the session and have sequence 1.",
          userMessage: "セッションを開始できませんでした。",
        }),
      );
    }

    return this.store.update((current) => {
      if (!current.groups.some((group) => group.id === session.groupId)) {
        return err(
          new AppError({
            code: "group_not_found",
            message: `Group not found: ${session.groupId}`,
            userMessage: "グループが見つかりません。",
          }),
        );
      }

      if (current.sessions.some((item) => item.id === session.id)) {
        return err(
          new AppError({
            code: "session_id_conflict",
            message: `Session ID already exists: ${session.id}`,
            userMessage: "セッションを開始できませんでした。",
          }),
        );
      }

      if (current.participantSegments.some((item) => item.id === segment.id)) {
        return err(
          new AppError({
            code: "segment_id_conflict",
            message: `Segment ID already exists: ${segment.id}`,
            userMessage: "セッションを開始できませんでした。",
          }),
        );
      }

      return ok({
        ...current,
        sessions: [...current.sessions, session],
        participantSegments: [...current.participantSegments, segment],
      });
    });
  }

  async remove(id: SessionId): Promise<Result<void>> {
    return this.store.update((current) => ok({
      ...current,
      sessions: current.sessions.filter((item) => item.id !== id),
      participantSegments: current.participantSegments.filter((item) => item.sessionId !== id),
    }));
  }

  async cancelEmpty(id: SessionId, expectedVersion?: number): Promise<Result<void>> {
    return this.store.update((current) => {
      const session = current.sessions.find((item) => item.id === id);
      if (session === undefined) {
        return err(new AppError({code:"session_not_found",message:`Session not found: ${id}`,userMessage:"Sessionが見つかりません。"}));
      }
      if (session.status !== "active") {
        return err(new AppError({code:"session_not_active",message:`Session is not active: ${id}`,userMessage:"このSessionはすでに終了しています。"}));
      }
      if (expectedVersion !== undefined && session.version !== expectedVersion) {
        return err(new AppError({code:"stale_update",message:`Session version mismatch: ${id}`,userMessage:"Sessionが別の端末で更新されています。最新の状態に更新してください。"}));
      }
      if (current.games.some((game) => game.sessionId === id)) {
        return err(new AppError({code:"session_not_empty",message:`Session has Games: ${id}`,userMessage:"半荘が登録されているSessionは取り消せません。"}));
      }
      return ok({
        ...current,
        sessions: current.sessions.filter((item) => item.id !== id),
        participantSegments: current.participantSegments.filter((item) => item.sessionId !== id),
      });
    });
  }

  async save(session: Session): Promise<Result<void>> {
    return this.store.update((current) => {
      const exists = current.sessions.some((item) => item.id === session.id);
      const sessions = exists
        ? current.sessions.map((item) => item.id === session.id ? session : item)
        : [...current.sessions, session];

      return ok({ ...current, sessions });
    });
  }

  async saveSegment(segment: ParticipantSegment): Promise<Result<void>> {
    const validation = validateParticipantSegment(segment);

    if (!validation.valid) {
      return err(
        new AppError({
          code: "participant_segment_invalid",
          message: validation.issues.map((issue) => issue.message).join(" / "),
          userMessage: "参加者の構成を確認してください。",
        }),
      );
    }

    return this.store.update((current) => {
      if (!current.sessions.some((session) => session.id === segment.sessionId)) {
        return err(
          new AppError({
            code: "session_not_found",
            message: `Session not found: ${segment.sessionId}`,
            userMessage: "セッションが見つかりません。",
          }),
        );
      }

      const exists = current.participantSegments.some((item) => item.id === segment.id);
      const participantSegments = exists
        ? current.participantSegments.map((item) => item.id === segment.id ? segment : item)
        : [...current.participantSegments, segment];

      return ok({ ...current, participantSegments });
    });
  }

  async findSegmentById(id: SegmentId): Promise<Result<ParticipantSegment | null>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(
      loaded.value.participantSegments.find((segment) => segment.id === id) ?? null,
    );
  }
}
