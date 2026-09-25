import type {
  ParticipantSegment,
  SegmentId,
  Session,
  SessionId,
  GroupId,
} from "../../domain";
import type { Result } from "../../shared/errors";

export interface SessionRepository {
  listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>>;
  findById(id: SessionId): Promise<Result<Session | null>>;
  listSegments(sessionId: SessionId): Promise<Result<readonly ParticipantSegment[]>>;
  createWithInitialSegment(session: Session, segment: ParticipantSegment): Promise<Result<void>>;
  save(session: Session): Promise<Result<void>>;
  remove(id: SessionId, expectedVersion?: number): Promise<Result<void>>;
  cancelEmpty(id: SessionId, expectedVersion?: number): Promise<Result<void>>;
  saveSegment(segment: ParticipantSegment): Promise<Result<void>>;
  findSegmentById(id: SegmentId): Promise<Result<ParticipantSegment | null>>;
}
