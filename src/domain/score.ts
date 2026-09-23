import { AppError, err, ok, type Result } from "../shared/errors";
import type { GameResult } from "./models";
import type { PlayerId } from "./ids";

const SUPPORTED_PARTICIPANT_COUNTS = new Set([3, 4]);

export interface RankedGameScoreInput {
  readonly rankedPlayerIds: readonly PlayerId[];
  readonly lowerRankScorePoints: readonly number[];
}

export const calculateRankedGameResults = ({
  rankedPlayerIds,
  lowerRankScorePoints,
}: RankedGameScoreInput): Result<readonly GameResult[]> => {
  if (!SUPPORTED_PARTICIPANT_COUNTS.has(rankedPlayerIds.length)) {
    return err(
      new AppError({
        code: "game_participant_count",
        message: "Game must contain three or four ranked players.",
        userMessage: "半荘の参加者は3人または4人である必要があります。",
      }),
    );
  }

  if (new Set(rankedPlayerIds).size !== rankedPlayerIds.length) {
    return err(
      new AppError({
        code: "game_participant_duplicate",
        message: "Ranked player IDs must be unique.",
        userMessage: "同じメンバーを重複して登録できません。",
      }),
    );
  }

  if (lowerRankScorePoints.length !== rankedPlayerIds.length - 1) {
    return err(
      new AppError({
        code: "game_score_input_count",
        message: "Scores are required for every player except first place.",
        userMessage: "1位以外のScore Pointを入力してください。",
      }),
    );
  }

  if (!lowerRankScorePoints.every(Number.isInteger)) {
    return err(
      new AppError({
        code: "game_score_not_integer",
        message: "Score Point values must be integers.",
        userMessage: "Score Pointは整数で入力してください。",
      }),
    );
  }

  const firstPlaceScore = -lowerRankScorePoints.reduce(
    (sum, scorePoint) => sum + scorePoint,
    0,
  );

  const scorePoints = [firstPlaceScore, ...lowerRankScorePoints];

  return ok(
    rankedPlayerIds.map((playerId, index) => ({
      playerId,
      scorePoint: scorePoints[index] as number,
    })),
  );
};
