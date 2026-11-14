-- Phase 4 P0 #345: additive recovery grant for an EXISTING linked User.
-- No UPDATE to users, group_players, memberships, invitations, games or scores.
-- Admin-issued, single-use token grants permission to add a WebAuthn credential
-- to the same User ID that already owns the linked Player.
CREATE TABLE passkey_recovery_grants (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE RESTRICT,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK(expires_at > created_at),
  used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_passkey_recovery_grants_target
  ON passkey_recovery_grants(user_id,created_at);
CREATE UNIQUE INDEX idx_passkey_recovery_grants_active_user
  ON passkey_recovery_grants(user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
