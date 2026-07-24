PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','admin','operator','viewer')),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  ip TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at DESC);

CREATE TABLE IF NOT EXISTS github_app (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  app_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_encrypted TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  webhook_secret_encrypted TEXT NOT NULL,
  html_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS github_installations (
  id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  repository_selection TEXT NOT NULL,
  suspended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'web' CHECK(kind IN ('web','worker')),
  repository_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  flake_output TEXT NOT NULL DEFAULT 'default',
  github_repository_id INTEGER,
  github_installation_id INTEGER REFERENCES github_installations(id) ON DELETE SET NULL,
  auto_deploy INTEGER NOT NULL DEFAULT 1 CHECK(auto_deploy IN (0,1)),
  desired_state TEXT NOT NULL DEFAULT 'running' CHECK(desired_state IN ('running','stopped')),
  restart_policy TEXT NOT NULL DEFAULT 'on-failure' CHECK(restart_policy IN ('never','on-failure','always','unless-stopped')),
  health_path TEXT NOT NULL DEFAULT '/',
  health_timeout_seconds INTEGER NOT NULL DEFAULT 5,
  startup_timeout_seconds INTEGER NOT NULL DEFAULT 1800,
  public_port INTEGER UNIQUE,
  active_internal_port INTEGER,
  active_deployment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  commit_sha TEXT,
  requested_ref TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK(trigger IN ('manual','github_push','reconcile','restart')),
  state TEXT NOT NULL CHECK(state IN ('queued','preparing','fetching','evaluating','starting','health-checking','activating','running','failed','cancelled','superseded','interrupted')),
  release_dir TEXT,
  internal_port INTEGER,
  pid INTEGER,
  process_group_id INTEGER,
  exit_code INTEGER,
  exit_signal TEXT,
  failure_code TEXT,
  failure_message TEXT,
  resource_confidence TEXT NOT NULL DEFAULT 'none' CHECK(resource_confidence IN ('none','low','medium','high')),
  queued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  activated_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1))
);
CREATE INDEX IF NOT EXISTS deployments_app_idx ON deployments(app_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS deployments_state_idx ON deployments(state, queued_at ASC);

CREATE TABLE IF NOT EXISTS app_environment (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  secret INTEGER NOT NULL DEFAULT 1 CHECK(secret IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(app_id, key)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT REFERENCES applications(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL,
  cpu_percent REAL,
  memory_bytes INTEGER,
  process_count INTEGER,
  free_disk_bytes INTEGER,
  total_memory_bytes INTEGER,
  available_memory_bytes INTEGER
);
CREATE INDEX IF NOT EXISTS metrics_lookup_idx ON metrics(app_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  repository_id INTEGER,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS cloudflare_config (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  account_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  tunnel_id TEXT,
  tunnel_name TEXT,
  tunnel_token_encrypted TEXT,
  dashboard_hostname TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
