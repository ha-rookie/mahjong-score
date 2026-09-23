import {
  invalid,
  valid,
  type ValidationIssue,
  type ValidationResult,
} from "../shared/validation";
import type { ChipResult, GameResult, ParticipantSegment } from "./models";

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
      message: "スコアは1,000点単位の整数である必要があります。",
    });
  }

  const total = results.reduce((sum, result) => sum + result.scorePoint, 0);

  if (total !== 0) {
    issues.push({
      code: "game_score_balance",
      path: "results",
      message: "対局スコアの合計は0である必要があります。",
    });
  }

  return issues.length === 0 ? valid() : invalid(...issues);
};

export const validateGameParticipants = (
  results: readonly GameResult[],
  participantPlayerIds: readonly string[],
): ValidationResult => {
  const resultIds = new Set(results.map((result) => result.playerId));
  const participantIds = new Set(participantPlayerIds);

  if (
    resultIds.size !== participantIds.size ||
    [...resultIds].some((playerId) => !participantIds.has(playerId))
  ) {
    return invalid({
      code: "game_participant_mismatch",
      path: "results",
      message: "対局結果の参加者が現在の参加者構成と一致しません。",
    });
  }

  return valid();
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
