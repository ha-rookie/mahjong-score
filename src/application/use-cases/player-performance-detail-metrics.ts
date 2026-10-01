import type { PlayerPerformanceDetailAggregate } from "./read-models";

export interface PlayerPerformanceDetailMetrics {
  readonly averageScorePoint: number;
  readonly averagePlacement: number;
  readonly gameWinRate: number;
  readonly lastPlaceRate: number;
  readonly sessionWinRate: number;
  readonly placements: readonly {
    readonly placement: 1 | 2 | 3 | 4;
    readonly count: number;
    readonly rate: number;
  }[];
}

export const derivePlayerPerformanceDetailMetrics=(aggregate:PlayerPerformanceDetailAggregate):PlayerPerformanceDetailMetrics=>{
  const gameCount=aggregate.gameCount;
  const sessionCount=aggregate.sessionCount;
  const counts=[aggregate.firstPlaceCount,aggregate.secondPlaceCount,aggregate.thirdPlaceCount,aggregate.fourthPlaceCount] as const;
  return {
    averageScorePoint:gameCount===0?0:aggregate.mahjongPointTotal/gameCount,
    averagePlacement:gameCount===0?0:aggregate.placementTotal/gameCount,
    gameWinRate:gameCount===0?0:aggregate.firstPlaceCount/gameCount*100,
    lastPlaceRate:gameCount===0?0:aggregate.lastPlaceCount/gameCount*100,
    sessionWinRate:sessionCount===0?0:aggregate.sessionFirstPlaceCount/sessionCount*100,
    placements:counts.map((count,index)=>({placement:(index+1) as 1|2|3|4,count,rate:gameCount===0?0:count/gameCount*100})),
  };
};
