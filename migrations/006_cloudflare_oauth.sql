ALTER TABLE cloudflare_config
ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'api_token'
CHECK(auth_method IN ('api_token', 'oauth'));

ALTER TABLE cloudflare_config
ADD COLUMN oauth_refresh_token_encrypted TEXT;

ALTER TABLE cloudflare_config
ADD COLUMN oauth_access_token_expires_at TEXT;

CREATE TABLE cloudflare_oauth_sessions (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verifier_encrypted TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX cloudflare_oauth_sessions_expiry_idx
ON cloudflare_oauth_sessions(expires_at);

CREATE TABLE cloudflare_oauth_pending (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  access_token_expires_at TEXT,
  scope TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
