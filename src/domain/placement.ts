import type { PlayerId } from "./ids";

export interface GamePlacementInput {
  readonly playerId: PlayerId;
  readonly scorePoint: number;
}

export interface GamePlacementResult extends GamePlacementInput {
  readonly placement: number;
  readonly isLast: boolean;
}

export const deriveGameResultPlacements = (
  results: readonly GamePlacementInput[],
): readonly GamePlacementResult[] | null => {
  if (![3, 4].includes(results.length)) return null;

  const highest = Math.max(...results.map((result) => result.scorePoint));
  if (results.filter((result) => result.scorePoint === highest).length !== 1) {
    return null;
  }

  const lowest = Math.min(...results.map((result) => result.scorePoint));
  return results.map((result) => ({
    ...result,
    placement: 1 + results.filter((other) => other.scorePoint > result.scorePoint).length,
    isLast: result.scorePoint === lowest,
  }));
};
