CREATE TABLE application_domains (
  hostname TEXT PRIMARY KEY COLLATE NOCASE,
  app_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX application_domains_app_idx
  ON application_domains(app_id, created_at);

INSERT OR IGNORE INTO application_domains(hostname, app_id, created_at, updated_at)
SELECT value, substr(key, 8), updated_at, updated_at
FROM settings
WHERE key LIKE 'domain:%'
  AND EXISTS (
    SELECT 1 FROM applications WHERE applications.id = substr(settings.key, 8)
  );

DELETE FROM settings WHERE key LIKE 'domain:%';
