import type { Clock, SessionRepository } from "../ports";
import type { Session, SessionId } from "../../domain";
import { AppError, err, type Result } from "../../shared/errors";

export class FinalizeSessionUseCase {
  constructor(private readonly sessions: SessionRepository, private readonly clock: Clock) {}

  async execute(sessionId: SessionId): Promise<Result<Session>> {
    const found = await this.sessions.findById(sessionId);
    if (!found.ok) return found;
    if (found.value === null) return err(new AppError({code:"session_not_found",message:`Session not found: ${sessionId}`,userMessage:"Sessionが見つかりません。"}));
    if (found.value.status !== "active") return err(new AppError({code:"session_not_active",message:`Session is not active: ${sessionId}`,userMessage:"このSessionはすでに終了しています。"}));
    const finalized: Session = {...found.value,status:"finalized",endedAt:this.clock.now()};
    const saved = await this.sessions.save(finalized);
    return saved.ok ? {ok:true,value:finalized} : saved;
  }
}
