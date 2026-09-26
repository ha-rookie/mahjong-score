import type {
  ParticipantSegment,
  PlayerId,
  SegmentId,
  Session,
  SessionId,
  GroupId,
} from "../../domain";
import type { Result } from "../../shared/errors";

export interface ActiveSessionSnapshot {
  readonly session: Session;
  readonly participantPlayerIds: readonly PlayerId[];
}

export interface SessionRepository {
  listByGroup(groupId: GroupId): Promise<Result<readonly Session[]>>;
  findActiveByGroup(groupId: GroupId): Promise<Result<ActiveSessionSnapshot | null>>;
  findById(id: SessionId): Promise<Result<Session | null>>;
  listSegments(sessionId: SessionId): Promise<Result<readonly ParticipantSegment[]>>;
  createWithInitialSegment(session: Session, segment: ParticipantSegment): Promise<Result<void>>;
  save(session: Session): Promise<Result<void>>;
  remove(id: SessionId, expectedVersion?: number): Promise<Result<void>>;
  cancelEmpty(id: SessionId, expectedVersion?: number): Promise<Result<void>>;
  saveSegment(segment: ParticipantSegment): Promise<Result<void>>;
  findSegmentById(id: SegmentId): Promise<Result<ParticipantSegment | null>>;
}
