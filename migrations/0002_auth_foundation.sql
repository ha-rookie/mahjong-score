CREATE TABLE users (id TEXT PRIMARY KEY,display_name TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE external_identities (provider TEXT NOT NULL,provider_subject TEXT NOT NULL,user_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(provider,provider_subject),UNIQUE(provider,user_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE group_memberships (group_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('admin','member')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(group_id,user_id),FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX idx_players_group_user ON players(user_id) WHERE user_id IS NOT NULL;
