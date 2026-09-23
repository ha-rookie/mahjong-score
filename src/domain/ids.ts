export type GroupId = string;
export type PlayerId = string;
export type SessionId = string;
export type SegmentId = string;
export type GameId = string;

export const isStableId = (value: string): boolean => value.trim().length > 0;
