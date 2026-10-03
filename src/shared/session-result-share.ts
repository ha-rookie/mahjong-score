import type { Game, Player, Session } from "../domain";

export type SessionShareRow = {
  playerId: string;
  displayName: string;
  finalPoint: number;
  rank: number;
};

export type SessionShareSummary = {
  sessionDate: string;
  modeLabel: string;
  gameCount: number;
  rows: readonly SessionShareRow[];
};

const formatPoint = (value: number): string => (value > 0 ? "+" : "") + value;

const rankLabel = (rank: number): string => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}位`;
};

export const normalizeAppTopUrl = (origin: string): string => `${origin.replace(/\/+$/, "")}/`;

export const buildSessionShareSummary = (
  session: Session,
  games: readonly Game[],
  players: readonly Player[],
): SessionShareSummary => {
  const participantIds: string[] = [];
  const seen = new Set<string>();
  for (const game of games) {
    for (const result of game.results) {
      if (!seen.has(result.playerId)) {
        seen.add(result.playerId);
        participantIds.push(result.playerId);
      }
    }
  }

  const mahjongPoints = new Map<string, number>();
  for (const game of games) {
    for (const result of game.results) {
      mahjongPoints.set(result.playerId, (mahjongPoints.get(result.playerId) ?? 0) + result.scorePoint);
    }
  }

  const playerName = new Map(players.map((player) => [player.id, player.displayName]));
  const chipRate = session.chipRate ?? 5;
  const chipCount = new Map(session.chipResults.map((result) => [result.playerId, result.chipCount]));
  const finalPoint = (playerId: string): number =>
    (mahjongPoints.get(playerId) ?? 0) + (chipCount.get(playerId) ?? 0) * chipRate;

  const rows = participantIds
    .map((playerId) => ({
      playerId,
      displayName: playerName.get(playerId) ?? "不明",
      finalPoint: finalPoint(playerId),
      rank: 1 + participantIds.filter((otherId) => finalPoint(otherId) > finalPoint(playerId)).length,
    }))
    .sort((left, right) => right.finalPoint - left.finalPoint || left.displayName.localeCompare(right.displayName, "ja"));

  return {
    sessionDate: session.sessionDate,
    modeLabel: participantIds.length === 4 ? "4人回し三麻" : "3人三麻",
    gameCount: games.length,
    rows,
  };
};

export const buildSessionShareText = (summary: SessionShareSummary): string => {
  const resultLines = summary.rows.map(
    (row) => `${rankLabel(row.rank)} ${row.displayName}　${formatPoint(row.finalPoint)}`,
  );
  return [
    "🀄 三麻スコア",
    `${summary.sessionDate}｜${summary.modeLabel}・${summary.gameCount}半荘`,
    "",
    ...resultLines,
    "",
    "三麻スコアを開く",
  ].join("\n");
};

export const buildSessionShareClipboardText = (
  summary: SessionShareSummary,
  appTopUrl: string,
): string => `${buildSessionShareText(summary)}\n${appTopUrl}`;
