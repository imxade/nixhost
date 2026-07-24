import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/server/db.ts";
import { paths } from "../src/server/paths.ts";

const db = getDb();
const integrity = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
const foreignKeyViolations = db.pragma("foreign_key_check") as Array<Record<string, unknown>>;
const migrations = db
  .prepare("SELECT name, applied_at FROM schema_migrations ORDER BY name")
  .all() as Array<{ name: string; applied_at: string }>;
const expectedMigrations = fs
  .readdirSync(path.join(process.cwd(), "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const appliedMigrations = migrations.map(({ name }) => name);
const journalMode = String(db.pragma("journal_mode", { simple: true }));
const healthy =
  integrity.every((item) => item.integrity_check === "ok") &&
  foreignKeyViolations.length === 0 &&
  JSON.stringify(appliedMigrations) === JSON.stringify(expectedMigrations) &&
  journalMode === "wal";

console.log(
  JSON.stringify(
    {
      database: paths.database,
      integrity,
      foreignKeyViolations,
      journalMode,
      expectedMigrations,
      migrations,
      healthy,
    },
    null,
    2,
  ),
);
process.exit(healthy ? 0 : 1);
