import type { GameRepository } from "../../application/ports";
import {
  validateGameParticipants,
  validateGameResults,
  type Game,
  type GameId,
  type SessionId,
} from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";
import type { LocalStorageAppDataStore } from "../storage";

export class LocalStorageGameRepository implements GameRepository {
  constructor(private readonly store: LocalStorageAppDataStore) {}

  async listBySession(sessionId: SessionId): Promise<Result<readonly Game[]>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(
      loaded.value.games
        .filter((game) => game.sessionId === sessionId)
        .sort((a, b) => a.sequence - b.sequence),
    );
  }

  async findById(id: GameId): Promise<Result<Game | null>> {
    const loaded = await this.store.load();

    if (!loaded.ok) {
      return loaded;
    }

    return ok(loaded.value.games.find((game) => game.id === id) ?? null);
  }

  async save(game: Game): Promise<Result<void>> {
    const resultValidation = validateGameResults(game.results);

    if (!resultValidation.valid) {
      return err(
        new AppError({
          code: "game_results_invalid",
          message: resultValidation.issues
            .map((issue) => issue.message)
            .join(" / "),
          userMessage: "対局結果を確認してください。",
        }),
      );
    }

    return this.store.update((current) => {
      const session = current.sessions.find(
        (item) => item.id === game.sessionId,
      );

      if (session === undefined) {
        return err(
          new AppError({
            code: "game_session_not_found",
            message: `Session not found: ${game.sessionId}`,
            userMessage: "セッションが見つかりません。",
          }),
        );
      }

      const segment = current.participantSegments.find(
        (item) => item.id === game.segmentId,
      );

      if (segment === undefined || segment.sessionId !== session.id) {
        return err(
          new AppError({
            code: "game_segment_invalid",
            message: "Game segment is missing or belongs to another session.",
            userMessage: "参加者構成を確認してください。",
          }),
        );
      }

      const participantValidation = validateGameParticipants(
        game.results,
        segment.participantPlayerIds,
      );

      if (!participantValidation.valid) {
        return err(
          new AppError({
            code: "game_participants_invalid",
            message: participantValidation.issues
              .map((issue) => issue.message)
              .join(" / "),
            userMessage: "対局結果の参加者を確認してください。",
          }),
        );
      }

      const exists = current.games.some((item) => item.id === game.id);
      const games = exists
        ? current.games.map((item) => (item.id === game.id ? game : item))
        : [...current.games, game];

      return ok({ ...current, games });
    });
  }
}
