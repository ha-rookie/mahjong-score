import type { GameRepository } from "../../application/ports";
import type {
  Game,
  GameId,
  SessionId,
} from "../../domain";
import { validateGameAgainstSegment } from "../../domain";
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
    return this.store.update((current) => {
      const session = current.sessions.find(
        (item) => item.id === game.sessionId,
      );

      if (session === undefined) {
        return err(
          new AppError({
            code: "game_session_not_found",
            message: `Session not found: ${game.sessionId}`,
            userMessage: "半荘を保存するSessionが見つかりません。",
          }),
        );
      }

      const segment = current.participantSegments.find(
        (item) => item.id === game.segmentId,
      );

      if (segment === undefined) {
        return err(
          new AppError({
            code: "game_segment_not_found",
            message: `Participant segment not found: ${game.segmentId}`,
            userMessage: "半荘の参加者情報が見つかりません。",
          }),
        );
      }

      const validation = validateGameAgainstSegment(game, segment);

      if (!validation.valid) {
        return err(
          new AppError({
            code: "game_invalid",
            message: validation.issues
              .map((issue) => `${issue.code}: ${issue.message}`)
              .join(" / "),
            userMessage: "半荘結果を確認してください。",
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
