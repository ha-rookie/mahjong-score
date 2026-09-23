import type { GroupId, Session, SessionId } from "../../domain";
import type { Result } from "../../shared/errors";

export interface SessionRepository {
  listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>>;
  findById(id: SessionId): Promise<Result<Session | null>>;
  save(session: Session): Promise<Result<void>>;
  remove(id: SessionId): Promise<Result<void>>;
}
