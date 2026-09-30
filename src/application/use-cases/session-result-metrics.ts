import type { Game, PlayerId } from "../../domain";

export interface SessionPlayerResultMetric {
  readonly playerId: PlayerId;
  readonly gameCount: number;
  readonly scorePointTotal: number;
  readonly averageScorePoint: number;
  readonly firstPlaceCount: number;
  readonly winRate: number;
}

export const calculateSessionResultMetrics = (
  participantPlayerIds: readonly PlayerId[],
  games: readonly Game[],
): readonly SessionPlayerResultMetric[] => {
  const totals = new Map<PlayerId, number>(participantPlayerIds.map((playerId) => [playerId, 0]));
  const firstPlaces = new Map<PlayerId, number>(participantPlayerIds.map((playerId) => [playerId, 0]));

  for (const game of games) {
    const bestScore = Math.max(...game.results.map((result) => result.scorePoint));
    for (const result of game.results) {
      if (!totals.has(result.playerId)) continue;
      totals.set(result.playerId, (totals.get(result.playerId) ?? 0) + result.scorePoint);
      if (result.scorePoint === bestScore) {
        firstPlaces.set(result.playerId, (firstPlaces.get(result.playerId) ?? 0) + 1);
      }
    }
  }

  const gameCount = games.length;
  return participantPlayerIds.map((playerId) => {
    const scorePointTotal = totals.get(playerId) ?? 0;
    const firstPlaceCount = firstPlaces.get(playerId) ?? 0;
    return {
      playerId,
      gameCount,
      scorePointTotal,
      averageScorePoint: gameCount === 0 ? 0 : scorePointTotal / gameCount,
      firstPlaceCount,
      winRate: gameCount === 0 ? 0 : firstPlaceCount / gameCount * 100,
    };
  });
};
