import type { Game, GameId, SessionId } from "../../domain";
import type { Result } from "../../shared/errors";

export interface GameRepository {
  listBySession(sessionId: SessionId): Promise<Result<readonly Game[]>>;
  findById(id: GameId): Promise<Result<Game | null>>;
  save(game: Game): Promise<Result<void>>;
}
