DROP INDEX IF EXISTS idx_players_group_user;
ALTER TABLE group_players ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_group_players_group_user ON group_players(group_id,user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_group_players_user ON group_players(user_id);
