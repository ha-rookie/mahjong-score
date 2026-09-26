import type {
  AppDataSchema,
  ChipResult,
  Game,
  GameResult,
  GameTag,
  Group,
  GroupMember,
  ParticipantSegment,
  Player,
  Session,
  SessionParticipantNote,
} from "../../domain";
import { AppError, err, ok, type Result } from "../../shared/errors";

export const CURRENT_SCHEMA_VERSION = 1;

const ROOT_KEYS = [
  "schemaVersion",
  "groups",
  "players",
  "groupMembers",
  "sessions",
  "participantSegments",
  "games",
] as const;

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (value: JsonRecord, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isString = (value: unknown): value is string => typeof value === "string";
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  isFiniteNumber(value) && Number.isInteger(value);

const isGroup = (value: unknown): value is Group =>
  isRecord(value) &&
  (hasExactKeys(value, ["id", "name", "createdAt", "updatedAt"]) || hasExactKeys(value, ["id", "name", "startingPoints", "returnPoints", "chipRate", "createdAt", "updatedAt"])) &&
  isString(value.id) &&
  isString(value.name) &&
  (value.startingPoints === undefined || (isInteger(value.startingPoints) && value.startingPoints > 0)) &&
  (value.returnPoints === undefined || (isInteger(value.returnPoints) && value.returnPoints > 0)) &&
  (value.chipRate === undefined || (isInteger(value.chipRate) && value.chipRate >= 0)) &&
  isString(value.createdAt) &&
  isString(value.updatedAt);

const isPlayer = (value: unknown): value is Player =>
  isRecord(value) &&
  hasExactKeys(value, ["id", "displayName", "createdAt", "updatedAt"]) &&
  isString(value.id) &&
  isString(value.displayName) &&
  isString(value.createdAt) &&
  isString(value.updatedAt);

const isGroupMember = (value: unknown): value is GroupMember =>
  isRecord(value) &&
  hasExactKeys(value, ["groupId", "playerId", "active"]) &&
  isString(value.groupId) &&
  isString(value.playerId) &&
  typeof value.active === "boolean";

const isParticipantNote = (value: unknown): value is SessionParticipantNote =>
  isRecord(value) &&
  hasExactKeys(value, ["playerId", "note"]) &&
  isString(value.playerId) &&
  isString(value.note);

const isChipResult = (value: unknown): value is ChipResult =>
  isRecord(value) &&
  hasExactKeys(value, ["playerId", "chipCount"]) &&
  isString(value.playerId) &&
  isInteger(value.chipCount);

const isSession = (value: unknown): value is Session =>
  isRecord(value) &&
  (hasExactKeys(value, ["id","groupId","sessionDate","startedAt","endedAt","status","note","participantNotes","chipResults"]) || hasExactKeys(value, ["id","groupId","sessionDate","startedAt","endedAt","status","note","participantNotes","chipResults","startingPoints","returnPoints","chipRate"])) &&
  isString(value.id) &&
  isString(value.groupId) &&
  isString(value.sessionDate) &&
  isString(value.startedAt) &&
  isNullableString(value.endedAt) &&
  (value.status === "active" || value.status === "finalized") &&
  isNullableString(value.note) &&
  (value.startingPoints === undefined || (isInteger(value.startingPoints) && value.startingPoints > 0)) &&
  (value.returnPoints === undefined || (isInteger(value.returnPoints) && value.returnPoints > 0)) &&
  (value.chipRate === undefined || (isInteger(value.chipRate) && value.chipRate >= 0)) &&
  Array.isArray(value.participantNotes) &&
  value.participantNotes.every(isParticipantNote) &&
  Array.isArray(value.chipResults) &&
  value.chipResults.every(isChipResult);

const isParticipantSegment = (value: unknown): value is ParticipantSegment =>
  isRecord(value) &&
  hasExactKeys(value, ["id", "sessionId", "sequence", "participantPlayerIds"]) &&
  isString(value.id) &&
  isString(value.sessionId) &&
  isInteger(value.sequence) &&
  Array.isArray(value.participantPlayerIds) &&
  value.participantPlayerIds.every(isString);

const isGameResult = (value: unknown): value is GameResult =>
  isRecord(value) &&
  hasExactKeys(value, ["playerId", "scorePoint"]) &&
  isString(value.playerId) &&
  isInteger(value.scorePoint);

const isGameTag = (value: unknown): value is GameTag =>
  isRecord(value) &&
  hasExactKeys(value, ["type", "playerId"]) &&
  (value.type === "yakuman" || value.type === "double-yakuman") &&
  isNullableString(value.playerId);

const isGame = (value: unknown): value is Game =>
  isRecord(value) &&
  hasExactKeys(value, [
    "id",
    "sessionId",
    "segmentId",
    "sequence",
    "playedAt",
    "results",
    "tags",
  ]) &&
  isString(value.id) &&
  isString(value.sessionId) &&
  isString(value.segmentId) &&
  isInteger(value.sequence) &&
  isString(value.playedAt) &&
  Array.isArray(value.results) &&
  value.results.every(isGameResult) &&
  Array.isArray(value.tags) &&
  value.tags.every(isGameTag);

export const createEmptyAppData = (): AppDataSchema => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  groups: [],
  players: [],
  groupMembers: [],
  sessions: [],
  participantSegments: [],
  games: [],
});

export const validateAppDataSchema = (
  value: unknown,
): Result<AppDataSchema> => {
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS)) {
    return err(
      new AppError({
        code: "storage_schema_invalid",
        message: "App data root schema is invalid.",
        userMessage: "保存データの形式を確認できませんでした。",
      }),
    );
  }

  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return err(
      new AppError({
        code: "storage_schema_unsupported",
        message: `Unsupported schema version: ${String(value.schemaVersion)}`,
        userMessage: "この保存データのバージョンには対応していません。",
      }),
    );
  }

  const validCollections =
    Array.isArray(value.groups) &&
    value.groups.every(isGroup) &&
    Array.isArray(value.players) &&
    value.players.every(isPlayer) &&
    Array.isArray(value.groupMembers) &&
    value.groupMembers.every(isGroupMember) &&
    Array.isArray(value.sessions) &&
    value.sessions.every(isSession) &&
    Array.isArray(value.participantSegments) &&
    value.participantSegments.every(isParticipantSegment) &&
    Array.isArray(value.games) &&
    value.games.every(isGame);

  if (!validCollections) {
    return err(
      new AppError({
        code: "storage_schema_invalid",
        message: "One or more app data collections are invalid.",
        userMessage: "保存データの内容を確認できませんでした。",
      }),
    );
  }

  return ok(value as unknown as AppDataSchema);
};
