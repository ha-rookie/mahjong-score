-- Phase 4 S2-B (#345) – standalone, non-destructive OAuth step-up state.
-- NOT connected to production routes until the explicit Human release gate.
-- Existing S1 auth_challenges, LINE sessions, users, Player and Score untouched.
CREATE TABLE passkey_line_stepups (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  reauth_at TEXT,
  proof_hash TEXT UNIQUE,
  proof_consumed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (proof_hash IS NULL OR (claimed_at IS NOT NULL AND reauth_at IS NOT NULL))
);
CREATE INDEX idx_passkey_line_stepups_user_recent ON passkey_line_stepups(user_id,created_at);
CREATE INDEX idx_passkey_line_stepups_expiry ON passkey_line_stepups(expires_at);
