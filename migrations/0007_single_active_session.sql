-- Enforce the application invariant that a Group can have at most one active Session.
-- A partial unique index keeps finalized history unrestricted while making concurrent starts race-safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_one_active_per_group
ON sessions(group_id)
WHERE status = 'active';
