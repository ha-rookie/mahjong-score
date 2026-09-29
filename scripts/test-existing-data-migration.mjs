import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appliedProductionMigrationNames } from "./migration-safety-policy.mjs";

const root = process.cwd();
const migrationsDir = path.join(root, "migrations");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), "mahjong-score-migration-"));
const combinedFile = path.join(persistDir, "existing-data-migration.sql");

const allMigrations = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const futureMigrations = allMigrations.filter(
  (name) => !appliedProductionMigrationNames.includes(name),
);

const readMigration = (name) =>
  `\n-- BEGIN ${name}\n${fs.readFileSync(path.join(migrationsDir, name), "utf8")}\n-- END ${name}\n`;

const fixtureSql = `
-- Representative data that already exists before future schema changes.
INSERT INTO groups(id,name,version,created_at,updated_at)
VALUES('guard-group','Migration Guard Group',1,'2026-09-29T00:00:00Z','2026-09-29T00:00:00Z');

INSERT INTO users(id,display_name,created_at,updated_at,system_role)
VALUES('guard-user','Guard User','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z','user');
INSERT INTO external_identities(provider,provider_subject,user_id,created_at)
VALUES('line','guard-provider-subject','guard-user','2026-09-29T00:00:00Z');
INSERT INTO group_memberships(group_id,user_id,role,created_at,updated_at)
VALUES('guard-group','guard-user','member','2026-09-29T00:00:00Z','2026-09-29T00:00:00Z');

INSERT INTO players(id,display_name,user_id,version,created_at,updated_at) VALUES
('guard-player-1','Player 1',NULL,1,'2026-09-29T00:00:00Z','2026-09-29T00:00:00Z'),
('guard-player-2','Player 2',NULL,1,'2026-09-29T00:00:00Z','2026-09-29T00:00:00Z'),
('guard-player-3','Player 3',NULL,1,'2026-09-29T00:00:00Z','2026-09-29T00:00:00Z');
INSERT INTO group_players(group_id,player_id,active,user_id) VALUES
('guard-group','guard-player-1',1,'guard-user'),
('guard-group','guard-player-2',1,NULL),
('guard-group','guard-player-3',1,NULL);

INSERT INTO sessions(
  id,group_id,session_date,started_at,ended_at,status,note,version,created_at,updated_at
) VALUES(
  'guard-session','guard-group','2026-09-29','2026-09-29T01:00:00Z','2026-09-29T02:00:00Z',
  'finalized','migration-guard-session-note',1,'2026-09-29T01:00:00Z','2026-09-29T02:00:00Z'
);
INSERT INTO participant_segments(id,session_id,sequence)
VALUES('guard-segment','guard-session',1);
INSERT INTO segment_players(segment_id,player_id,seat_order) VALUES
('guard-segment','guard-player-1',1),
('guard-segment','guard-player-2',2),
('guard-segment','guard-player-3',3);
INSERT INTO games(id,session_id,segment_id,sequence,played_at,version)
VALUES('guard-game','guard-session','guard-segment',1,'2026-09-29T01:30:00Z',1);
INSERT INTO game_results(game_id,player_id,rank,score_point) VALUES
('guard-game','guard-player-1',1,10),
('guard-game','guard-player-2',2,0),
('guard-game','guard-player-3',3,-10);
INSERT INTO chip_results(session_id,player_id,chip_count) VALUES
('guard-session','guard-player-1',2),
('guard-session','guard-player-2',-1),
('guard-session','guard-player-3',-1);
INSERT INTO session_participant_notes(session_id,player_id,note)
VALUES('guard-session','guard-player-1','migration-guard-participant-note');
`;

const combinedSql = [
  "PRAGMA foreign_keys = ON;\n",
  ...appliedProductionMigrationNames.map(readMigration),
  fixtureSql,
  ...futureMigrations.map(readMigration),
].join("\n");
fs.writeFileSync(combinedFile, combinedSql);

const runWrangler = (args, options = {}) =>
  execFileSync(npx, ["wrangler", ...args], {
    cwd: root,
    env: process.env,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

try {
  runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    persistDir,
    "--file",
    combinedFile,
  ]);

  const verificationSql = `
SELECT
  (SELECT COUNT(*) FROM groups WHERE id='guard-group') AS groups_count,
  (SELECT COUNT(*) FROM users WHERE id='guard-user') AS users_count,
  (SELECT COUNT(*) FROM external_identities WHERE user_id='guard-user') AS identities_count,
  (SELECT COUNT(*) FROM group_memberships WHERE group_id='guard-group' AND user_id='guard-user' AND role='member') AS memberships_count,
  (SELECT COUNT(*) FROM group_players WHERE group_id='guard-group' AND user_id='guard-user') AS player_links_count,
  (SELECT COUNT(*) FROM sessions WHERE id='guard-session' AND status='finalized') AS sessions_count,
  (SELECT note FROM sessions WHERE id='guard-session') AS session_note,
  (SELECT COUNT(*) FROM games WHERE id='guard-game' AND session_id='guard-session') AS games_count,
  (SELECT COUNT(*) FROM game_results WHERE game_id='guard-game') AS results_count,
  (SELECT COUNT(*) FROM chip_results WHERE session_id='guard-session') AS chips_count,
  (SELECT COUNT(*) FROM session_participant_notes WHERE session_id='guard-session') AS participant_notes_count,
  (SELECT COUNT(*) FROM sessions s LEFT JOIN games g ON g.session_id=s.id WHERE s.group_id='guard-group' AND s.status='finalized' GROUP BY s.id) AS history_game_count,
  (SELECT SUM(gr.score_point) FROM game_results gr JOIN games g ON g.id=gr.game_id JOIN sessions s ON s.id=g.session_id WHERE s.group_id='guard-group' AND s.status='finalized') AS performance_total;
`;

  const raw = runWrangler(
    [
      "d1",
      "execute",
      "DB",
      "--local",
      "--persist-to",
      persistDir,
      "--json",
      "--command",
      verificationSql,
    ],
    { capture: true },
  );
  const firstJson = Math.min(
    ...["[", "{"].map((char) => {
      const index = raw.indexOf(char);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    }),
  );
  if (!Number.isFinite(firstJson)) {
    throw new Error("Wrangler verification output did not contain JSON");
  }
  const parsed = JSON.parse(raw.slice(firstJson));
  const rows = Array.isArray(parsed)
    ? parsed.flatMap((entry) => entry.results ?? [])
    : (parsed.results ?? []);
  const row = rows[0];
  if (!row) throw new Error("Migration verification returned no row");

  const expectedCounts = {
    groups_count: 1,
    users_count: 1,
    identities_count: 1,
    memberships_count: 1,
    player_links_count: 1,
    sessions_count: 1,
    games_count: 1,
    results_count: 3,
    chips_count: 3,
    participant_notes_count: 1,
    history_game_count: 1,
    performance_total: 0,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    if (Number(row[key]) !== expected) {
      throw new Error(
        `Existing-data migration regression failed for ${key}: expected ${expected}, got ${row[key]}`,
      );
    }
  }
  if (row.session_note !== "migration-guard-session-note") {
    throw new Error("Existing Session Memo changed during migration regression");
  }

  console.log(
    `Existing-data migration regression passed: representative Production-shaped data survived ${futureMigrations.length} future migration(s).`,
  );
} finally {
  fs.rmSync(persistDir, { recursive: true, force: true });
}
