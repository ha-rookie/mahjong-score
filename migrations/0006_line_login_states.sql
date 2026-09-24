CREATE TABLE line_login_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  invitation_id TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(invitation_id) REFERENCES invitations(id) ON DELETE SET NULL
);
CREATE INDEX idx_line_login_states_expires ON line_login_states(expires_at);
