CREATE TABLE ios_pwa_auth_handoffs (
  handoff_hash TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  user_id TEXT,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_ios_pwa_auth_handoffs_expires ON ios_pwa_auth_handoffs(expires_at);
