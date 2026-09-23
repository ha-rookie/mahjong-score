import { AppError, err, ok, type Result } from "../shared/errors";
import type { PlayerId } from "./ids";
import type { GameResult } from "./models";

const SUPPORTED_PLAYER_COUNTS = new Set([3, 4]);

export interface CreateGameResultsFromScoreSheetInput {
  readonly participantPlayerIds: readonly PlayerId[];
  readonly scorePointsByPlayer: Readonly<Record<PlayerId, number | null>>;
}

export const createGameResultsFromScoreSheet = (
  input: CreateGameResultsFromScoreSheetInput,
): Result<readonly GameResult[]> => {
  const playerCount = input.participantPlayerIds.length;
  if (!SUPPORTED_PLAYER_COUNTS.has(playerCount)) {
    return err(new AppError({
      code: "score_player_count_invalid",
      message: "Participant count must be 3 or 4.",
      userMessage: "参加者は3人または4人で入力してください。",
    }));
  }
  if (new Set(input.participantPlayerIds).size !== playerCount) {
    return err(new AppError({
      code: "score_duplicate_player",
      message: "Participant player IDs must be unique.",
      userMessage: "同じ参加者を重複して入力できません。",
    }));
  }

  const values = input.participantPlayerIds.map(
    (playerId) => input.scorePointsByPlayer[playerId] ?? null,
  );
  const missingIndexes = values
    .map((value, index) => value === null ? index : -1)
    .filter((index) => index >= 0);

  if (missingIndexes.length !== 1) {
    return err(new AppError({
      code: "score_input_count_invalid",
      message: "Exactly one participant score must be omitted.",
      userMessage: "1人分だけ空欄にして、残りのスコアを入力してください。",
    }));
  }
  if (!values.every((value) => value === null || Number.isInteger(value))) {
    return err(new AppError({
      code: "score_point_not_integer",
      message: "Score Point must be an integer.",
      userMessage: "スコアは1,000点単位の整数で入力してください。",
    }));
  }

  const enteredTotal = values.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const calculatedIndex = missingIndexes[0]!;
  return ok(input.participantPlayerIds.map((playerId, index) => ({
    playerId,
    scorePoint: index === calculatedIndex ? -enteredTotal : values[index]!,
  })));
};

// Kept for stored-result compatibility and tests that rely on explicit rank order.
export interface CreateRankedGameResultsInput {
  readonly rankedPlayerIds: readonly PlayerId[];
  readonly lowerRankScorePoints: readonly number[];
}

export const createRankedGameResults = (
  input: CreateRankedGameResultsInput,
): Result<readonly GameResult[]> => {
  const scores: Record<PlayerId, number | null> = {};
  input.rankedPlayerIds.forEach((playerId, index) => {
    scores[playerId] = index === 0 ? null : input.lowerRankScorePoints[index - 1] ?? null;
  });
  return createGameResultsFromScoreSheet({
    participantPlayerIds: input.rankedPlayerIds,
    scorePointsByPlayer: scores,
  });
};
