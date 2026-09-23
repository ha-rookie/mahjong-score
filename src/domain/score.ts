import { AppError, err, ok, type Result } from "../shared/errors";
import type { PlayerId } from "./ids";
import type { GameResult } from "./models";

const SUPPORTED_PLAYER_COUNTS = new Set([3, 4]);

export interface CreateRankedGameResultsInput {
  readonly rankedPlayerIds: readonly PlayerId[];
  readonly lowerRankScorePoints: readonly number[];
}

export const createRankedGameResults = (
  input: CreateRankedGameResultsInput,
): Result<readonly GameResult[]> => {
  const playerCount = input.rankedPlayerIds.length;

  if (!SUPPORTED_PLAYER_COUNTS.has(playerCount)) {
    return err(
      new AppError({
        code: "score_player_count_invalid",
        message: "Ranked player count must be 3 or 4.",
        userMessage: "参加者は3人または4人で入力してください。",
      }),
    );
  }

  if (new Set(input.rankedPlayerIds).size !== playerCount) {
    return err(
      new AppError({
        code: "score_duplicate_player",
        message: "Ranked player IDs must be unique.",
        userMessage: "同じ参加者を重複して入力できません。",
      }),
    );
  }

  if (input.lowerRankScorePoints.length !== playerCount - 1) {
    return err(
      new AppError({
        code: "score_input_count_invalid",
        message: "Lower-rank score count must be one less than player count.",
        userMessage: "2位以下のスコア入力数を確認してください。",
      }),
    );
  }

  if (!input.lowerRankScorePoints.every(Number.isInteger)) {
    return err(
      new AppError({
        code: "score_point_not_integer",
        message: "Score Point must be an integer.",
        userMessage: "スコアは1,000点単位の整数で入力してください。",
      }),
    );
  }

  const firstPlaceScorePoint = -input.lowerRankScorePoints.reduce(
    (sum, scorePoint) => sum + scorePoint,
    0,
  );

  const results: readonly GameResult[] = input.rankedPlayerIds.map(
    (playerId, index) => ({
      playerId,
      scorePoint:
        index === 0
          ? firstPlaceScorePoint
          : input.lowerRankScorePoints[index - 1]!,
    }),
  );

  return ok(results);
};
