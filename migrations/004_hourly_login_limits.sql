ALTER TABLE login_attempts ADD COLUMN window_started_at TEXT;

UPDATE login_attempts
SET window_started_at = updated_at
WHERE window_started_at IS NULL;
