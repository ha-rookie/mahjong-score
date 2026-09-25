DELETE FROM sessions WHERE group_id IN ('perf-5y','perf-10y');
DELETE FROM group_players WHERE group_id IN ('perf-5y','perf-10y');
DELETE FROM players WHERE id LIKE 'perf-5y-p%' OR id LIKE 'perf-10y-p%';
DELETE FROM groups WHERE id IN ('perf-5y','perf-10y');
