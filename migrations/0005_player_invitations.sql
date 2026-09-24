CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role='member'),
  created_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by_user_id TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_invitations_group ON invitations(group_id,created_at);
CREATE INDEX idx_invitations_player ON invitations(group_id,player_id);
CREATE UNIQUE INDEX idx_invitations_active_player
  ON invitations(group_id,player_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
