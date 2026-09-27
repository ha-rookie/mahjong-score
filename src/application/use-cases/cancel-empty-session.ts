import type { GameRepository, SessionRepository } from "../ports";
import type { SessionId } from "../../domain";
import type { Result } from "../../shared/errors";

export class CancelEmptySessionUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly games: GameRepository,
  ) {}

  async execute(sessionId: SessionId, expectedVersion?: number): Promise<Result<void>> {
    return this.sessions.cancelEmpty(sessionId, expectedVersion);
  }
}
