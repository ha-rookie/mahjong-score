ALTER TABLE users ADD COLUMN system_role TEXT NOT NULL DEFAULT 'user' CHECK(system_role IN('admin','user'));

CREATE TABLE group_memberships_new (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('group_admin','member')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(group_id,user_id),
  FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO group_memberships_new(group_id,user_id,role,created_at,updated_at)
SELECT group_id,user_id,CASE WHEN role='admin' THEN 'group_admin' ELSE role END,created_at,updated_at
FROM group_memberships;
DROP TABLE group_memberships;
ALTER TABLE group_memberships_new RENAME TO group_memberships;
CREATE INDEX idx_group_memberships_user ON group_memberships(user_id);
