-- Issue #343 / Phase 4 S1: additive auth foundation only.
-- No runtime Passkey endpoints, account linking, or Production migration is authorized by this file.
-- Existing users/players/games/LINE identities and all prior migrations remain untouched.

ALTER TABLE users
  ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0 CHECK(auth_version >= 0);

-- The credential identifier MUST remain globally unique even after revocation;
-- reassigning an old passkey identifier to another User would be an account takeover risk.
CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BLOB NOT NULL CHECK(length(public_key) > 0),
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK(sign_count >= 0),
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER CHECK(backed_up IN (0,1)),
  label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX idx_passkey_credentials_user ON passkey_credentials(user_id, revoked_at);

-- Challenge is stored as a digest; only the challenge *hash* is retained.
-- A verified assertion must be correlated to its purpose and server-defined RP/origin.
-- This table is NOT a replacement for proper atomic verification/consumption logic.
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  challenge_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('register_invite','register_user','login')),
  user_id TEXT,
  invitation_id TEXT,
  expected_origin TEXT NOT NULL,
  rp_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(invitation_id) REFERENCES invitations(id) ON DELETE CASCADE,
  CHECK(expires_at > created_at)
);
CREATE INDEX idx_auth_challenges_expiry ON auth_challenges(expires_at, consumed_at);
CREATE INDEX idx_auth_challenges_user ON auth_challenges(user_id, purpose);
