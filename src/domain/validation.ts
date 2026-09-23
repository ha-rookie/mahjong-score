import {
  invalid,
  valid,
  type ValidationIssue,
  type ValidationResult,
} from "../shared/validation";
import type {
  ChipResult,
  Game,
  GameResult,
  ParticipantSegment,
} from "./models";

const SUPPORTED_PARTICIPANT_COUNTS = new Set([3, 4]);

export const validateParticipantSegment = (
  segment: ParticipantSegment,
): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const count = segment.participantPlayerIds.length;

  if (!SUPPORTED_PARTICIPANT_COUNTS.has(count)) {
    issues.push({
      code: "participant_count",
      path: "participantPlayerIds",
      message: "参加者は3人または4人である必要があります。",
    });
  }

  if (new Set(segment.participantPlayerIds).size !== count) {
    issues.push({
      code: "duplicate_participant",
      path: "participantPlayerIds",
      message: "同じ参加者を重複して登録できません。",
    });
  }

  return issues.length === 0 ? valid() : invalid(...issues);
};

export const validateGameResults = (
  results: readonly GameResult[],
): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const count = results.length;

  if (!SUPPORTED_PARTICIPANT_COUNTS.has(count)) {
    issues.push({
      code: "game_result_count",
      path: "results",
      message: "対局結果は3人または4人分である必要があります。",
    });
  }

  if (new Set(results.map((result) => result.playerId)).size !== count) {
    issues.push({
      code: "duplicate_game_result_player",
      path: "results",
      message: "同じ参加者の対局結果を重複して登録できません。",
    });
  }

  if (!results.every((result) => Number.isInteger(result.scorePoint))) {
    issues.push({
      code: "game_score_not_integer",
      path: "results",
      message: "Score Pointは整数である必要があります。",
    });
  }

  const scoreTotal = results.reduce(
    (sum, result) => sum + result.scorePoint,
    0,
  );

  if (scoreTotal !== 0) {
    issues.push({
      code: "game_score_balance",
      path: "results",
      message: "Score Pointの合計は0である必要があります。",
    });
  }

  return issues.length === 0 ? valid() : invalid(...issues);
};

export const validateGameAgainstSegment = (
  game: Game,
  segment: ParticipantSegment,
): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const gameValidation = validateGameResults(game.results);

  if (!gameValidation.valid) {
    issues.push(...gameValidation.issues);
  }

  if (game.segmentId !== segment.id) {
    issues.push({
      code: "game_segment_mismatch",
      path: "segmentId",
      message: "Gameが対象の参加者区間を参照していません。",
    });
  }

  if (game.sessionId !== segment.sessionId) {
    issues.push({
      code: "game_session_mismatch",
      path: "sessionId",
      message: "Gameと参加者区間のSessionが一致しません。",
    });
  }

  const gamePlayerIds = game.results.map((result) => result.playerId);
  const segmentPlayerIds = segment.participantPlayerIds;
  const samePlayers =
    gamePlayerIds.length === segmentPlayerIds.length &&
    gamePlayerIds.every((playerId) => segmentPlayerIds.includes(playerId));

  if (!samePlayers) {
    issues.push({
      code: "game_result_players_mismatch",
      path: "results",
      message: "半荘結果のメンバーが現在の参加者と一致しません。",
    });
  }

  return issues.length === 0 ? valid() : invalid(...issues);
};

export const validateChipResults = (
  results: readonly ChipResult[],
): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const playerIds = results.map((result) => result.playerId);

  if (new Set(playerIds).size !== playerIds.length) {
    issues.push({
      code: "duplicate_chip_player",
      path: "chipResults",
      message: "同じ参加者のチップ結果を重複して登録できません。",
    });
  }

  const total = results.reduce((sum, result) => sum + result.chipCount, 0);

  if (total !== 0) {
    issues.push({
      code: "chip_balance",
      path: "chipResults",
      message: "チップの合計は0である必要があります。",
    });
  }

  return issues.length === 0 ? valid() : invalid(...issues);
};
