import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { logger } from "./logger.ts";
import { ensureDataDirectories, paths } from "./paths.ts";

let instance: Database.Database | undefined;

export function getDb(): Database.Database {
  if (instance) return instance;
  ensureDataDirectories();
  instance = new Database(paths.database, {
    timeout: 5000,
    fileMustExist: false,
  });
  fs.chmodSync(paths.database, 0o600);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.pragma("busy_timeout = 5000");
  instance.pragma("synchronous = NORMAL");
  instance.pragma("temp_store = MEMORY");
  migrate(instance);
  return instance;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const migrationDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "migrations");
  if (!fs.existsSync(migrationDir)) {
    throw new Error(`Migration directory is missing: ${migrationDir}`);
  }
  const applied = new Set(
    (db.prepare("SELECT name FROM schema_migrations").all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  );
  const files = fs
    .readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(process.cwd(), "migrations", file), "utf8");
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    apply();
    logger.info("Applied database migration", { migration: file });
  }
}

export function closeDb(): void {
  instance?.close();
  instance = undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function setting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowIso());
}
