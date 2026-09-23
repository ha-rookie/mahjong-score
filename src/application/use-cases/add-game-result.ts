import type { Clock, GameRepository, IdGenerator, SessionRepository } from "../ports";
import { createGameResultsFromScoreSheet, type Game, type GameTag, type PlayerId, type SessionId } from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";

export interface AddGameResultInput {
  readonly sessionId: SessionId;
  readonly scorePointsByPlayer: Readonly<Record<PlayerId, number | null>>;
  readonly tags?: readonly GameTag[];
}

export class AddGameResultUseCase {
  constructor(
    private readonly games: GameRepository,
    private readonly sessions: SessionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: AddGameResultInput): Promise<Result<Game>> {
    const session = await this.sessions.findById(input.sessionId);
    if (!session.ok) return session;
    if (session.value === null || session.value.status !== "active") {
      return err(new AppError({
        code: "game_session_not_active",
        message: "Game can only be added to an active session.",
        userMessage: "対局中のSessionが見つかりません。",
      }));
    }

    const segments = await this.sessions.listSegments(input.sessionId);
    if (!segments.ok) return segments;
    const currentSegment = [...segments.value].sort((a, b) => b.sequence - a.sequence)[0];
    if (currentSegment === undefined) {
      return err(new AppError({
        code: "game_segment_not_found",
        message: "Current participant segment was not found.",
        userMessage: "現在の参加者構成が見つかりません。",
      }));
    }

    const suppliedPlayerIds = Object.keys(input.scorePointsByPlayer);
    const participantIds = new Set(currentSegment.participantPlayerIds);
    if (
      suppliedPlayerIds.length !== participantIds.size ||
      suppliedPlayerIds.some((id) => !participantIds.has(id))
    ) {
      return err(new AppError({
        code: "game_score_players_invalid",
        message: "Score sheet players must exactly match the current segment.",
        userMessage: "スコア表には現在の参加者全員を指定してください。",
      }));
    }

    const results = createGameResultsFromScoreSheet({
      participantPlayerIds: currentSegment.participantPlayerIds,
      scorePointsByPlayer: input.scorePointsByPlayer,
    });
    if (!results.ok) return results;

    const existing = await this.games.listBySession(input.sessionId);
    if (!existing.ok) return existing;
    const game: Game = {
      id: this.ids.generate(),
      sessionId: input.sessionId,
      segmentId: currentSegment.id,
      sequence: existing.value.reduce((max, item) => Math.max(max, item.sequence), 0) + 1,
      playedAt: this.clock.now(),
      results: results.value,
      tags: input.tags ?? [],
    };
    const saved = await this.games.save(game);
    return saved.ok ? ok(game) : saved;
  }
}
