import type { MahjongRules } from "./rules";
import type {
  GameId,
  GroupId,
  PlayerId,
  SegmentId,
  SessionId,
} from "./ids";

export type IsoDate = string;
export type IsoDateTime = string;

export interface Group extends MahjongRules {
  readonly id: GroupId;
  readonly name: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface Player {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface GroupMember {
  readonly groupId: GroupId;
  readonly playerId: PlayerId;
  readonly active: boolean;
}

export type SessionStatus = "active" | "finalized";

export interface SessionParticipantNote {
  readonly playerId: PlayerId;
  readonly note: string;
}

export interface ChipResult {
  readonly playerId: PlayerId;
  readonly chipCount: number;
}

export interface Session extends MahjongRules {
  readonly id: SessionId;
  readonly version?: number;
  readonly groupId: GroupId;
  readonly sessionDate: IsoDate;
  readonly startedAt: IsoDateTime;
  readonly endedAt: IsoDateTime | null;
  readonly status: SessionStatus;
  readonly note: string | null;
  readonly participantNotes: readonly SessionParticipantNote[];
  readonly chipResults: readonly ChipResult[];
}

export interface ParticipantSegment {
  readonly id: SegmentId;
  readonly sessionId: SessionId;
  readonly sequence: number;
  readonly participantPlayerIds: readonly PlayerId[];
}

export type GameTagType = "yakuman" | "double-yakuman";

export interface GameTag {
  readonly type: GameTagType;
  readonly playerId: PlayerId | null;
}

export interface GameResult {
  readonly playerId: PlayerId;
  readonly scorePoint: number;
}

export interface Game {
  readonly id: GameId;
  readonly version?: number;
  readonly sessionId: SessionId;
  readonly segmentId: SegmentId;
  readonly sequence: number;
  readonly playedAt: IsoDateTime;
  readonly results: readonly GameResult[];
  readonly tags: readonly GameTag[];
}

export interface AppDataSchema {
  readonly schemaVersion: number;
  readonly groups: readonly Group[];
  readonly players: readonly Player[];
  readonly groupMembers: readonly GroupMember[];
  readonly sessions: readonly Session[];
  readonly participantSegments: readonly ParticipantSegment[];
  readonly games: readonly Game[];
}
