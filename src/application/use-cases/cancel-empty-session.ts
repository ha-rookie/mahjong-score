import type { GameRepository, SessionRepository } from "../ports";
import type { SessionId } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export class CancelEmptySessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly games: GameRepository,
  ) {}

  async execute(sessionId: SessionId): Promise<Result<void>> {
    const found = await this.sessions.findById(sessionId);
    if (!found.ok) return found;
    if (found.value === null) {
      return err(new AppError({
        code:"session_not_found",
        message:`Session not found: ${sessionId}`,
        userMessage:"Sessionが見つかりません。",
      }));
    }
    if (found.value.status !== "active") {
      return err(new AppError({
        code:"session_not_active",
        message:`Session is not active: ${sessionId}`,
        userMessage:"このSessionはすでに終了しています。",
      }));
    }

    const sessionGames = await this.games.listBySession(sessionId);
    if (!sessionGames.ok) return sessionGames;
    if (sessionGames.value.length > 0) {
      return err(new AppError({
        code:"session_not_empty",
        message:`Session has ${sessionGames.value.length} Game(s): ${sessionId}`,
        userMessage:"半荘が登録されているSessionは取り消せません。",
      }));
    }

    return this.sessions.cancelEmpty(sessionId, found.value.version);
  }
}
