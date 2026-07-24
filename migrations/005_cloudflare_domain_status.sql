CREATE TABLE cloudflare_domain_status (
  hostname TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('managed','external','error')),
  zone_id TEXT,
  last_error TEXT,
  last_synced_at TEXT NOT NULL
);

CREATE INDEX cloudflare_domain_status_app_idx
  ON cloudflare_domain_status(app_id, hostname);
