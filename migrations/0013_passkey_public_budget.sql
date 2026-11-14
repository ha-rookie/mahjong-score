-- P0 #345 public passkey D1 write admission. Additive, no existing data changes.
-- Keys hold only a fixed 5-minute UTC bucket and a SHA-256 pseudonym.
CREATE TABLE passkey_option_budgets (
  bucket TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts>=1 AND attempts<=40)
);
CREATE INDEX idx_passkey_option_budgets_retention ON passkey_option_budgets(window_start);
CREATE INDEX idx_auth_challenges_retention ON auth_challenges(expires_at);
