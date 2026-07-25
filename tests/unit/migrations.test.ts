import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("database migrations", () => {
  it("apply from an empty database", () => {
    const db = temporaryDatabase();
    apply(db, migration("001_initial.sql"));
    apply(db, migration("002_process_identity.sql"));
    apply(db, migration("003_application_domains.sql"));
    apply(db, migration("004_hourly_login_limits.sql"));
    apply(db, migration("005_cloudflare_domain_status.sql"));
    apply(db, migration("006_cloudflare_oauth.sql"));
    apply(db, migration("007_quick_tunnels.sql"));

    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'application_domains'",
        )
        .get(),
    ).toEqual({ name: "application_domains" });
    expect(db.prepare("SELECT window_started_at FROM login_attempts").columns()[0]?.name).toBe(
      "window_started_at",
    );
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloudflare_domain_status'",
        )
        .get(),
    ).toEqual({ name: "cloudflare_domain_status" });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cloudflare_oauth_sessions'",
        )
        .get(),
    ).toEqual({ name: "cloudflare_oauth_sessions" });
    expect(db.prepare("SELECT auth_method FROM cloudflare_config").columns()[0]?.name).toBe(
      "auth_method",
    );
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'quick_tunnels'")
        .get(),
    ).toEqual({ name: "quick_tunnels" });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });

  it("moves legacy application domain settings into the normalized domain table", () => {
    const db = temporaryDatabase();
    apply(db, migration("001_initial.sql"));
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO applications(
        id, name, slug, kind, repository_url, branch, flake_output,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'web', ?, 'main', 'default', ?, ?)`,
    ).run("app-1", "Example", "example", "https://github.com/example/app.git", now, now);
    db.prepare("INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)").run(
      "domain:app-1",
      "app.example.com",
      now,
    );

    apply(db, migration("002_process_identity.sql"));
    apply(db, migration("003_application_domains.sql"));
    apply(db, migration("004_hourly_login_limits.sql"));
    apply(db, migration("005_cloudflare_domain_status.sql"));
    apply(db, migration("006_cloudflare_oauth.sql"));
    apply(db, migration("007_quick_tunnels.sql"));

    expect(db.prepare("SELECT hostname, app_id FROM application_domains").all()).toEqual([
      { hostname: "app.example.com", app_id: "app-1" },
    ]);
    expect(db.prepare("SELECT 1 FROM settings WHERE key LIKE 'domain:%'").get()).toBeUndefined();
    db.close();
  });
});

function temporaryDatabase(): Database.Database {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-migrations-"));
  temporaryDirectories.push(directory);
  const db = new Database(path.join(directory, "test.sqlite"));
  db.pragma("foreign_keys = ON");
  return db;
}

function migration(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), "migrations", name), "utf8");
}

function apply(db: Database.Database, sql: string): void {
  db.transaction(() => db.exec(sql))();
}
