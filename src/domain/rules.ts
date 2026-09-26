export interface MahjongRules {
  readonly startingPoints: number;
  readonly returnPoints: number;
  readonly chipRate: number;
}

export const DEFAULT_MAHJONG_RULES:MahjongRules={
  startingPoints:35000,
  returnPoints:40000,
  chipRate:5,
};

export const validateMahjongRules=(rules:MahjongRules):boolean=>
  Number.isInteger(rules.startingPoints)&&rules.startingPoints>0&&
  Number.isInteger(rules.returnPoints)&&rules.returnPoints>0&&
  Number.isInteger(rules.chipRate)&&rules.chipRate>=0;
