CREATE TABLE quick_tunnels (
  key TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK(target_type IN ('dashboard', 'application')),
  app_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  local_port INTEGER NOT NULL CHECK(local_port BETWEEN 1 AND 65535),
  url TEXT,
  status TEXT NOT NULL CHECK(status IN ('starting', 'running', 'error')),
  pid INTEGER,
  process_group_id INTEGER,
  process_start_ticks TEXT,
  process_command_hash TEXT,
  process_command_summary TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK(
    (target_type = 'dashboard' AND app_id IS NULL AND key = 'dashboard') OR
    (target_type = 'application' AND app_id IS NOT NULL AND key = 'app:' || app_id)
  )
);

CREATE UNIQUE INDEX quick_tunnels_app_idx
  ON quick_tunnels(app_id)
  WHERE app_id IS NOT NULL;
