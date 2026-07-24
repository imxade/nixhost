import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-auth-test-"));
process.env.NIXHOST_DATA_DIR = dataDirectory;
process.env.NIXHOST_MASTER_KEY = Buffer.alloc(32, 23).toString("base64");

const [{ login }, database] = await Promise.all([
  import("../../src/server/auth.ts"),
  import("../../src/server/db.ts"),
]);

const now = "2026-07-24T12:00:00.000Z";
database
  .getDb()
  .prepare(
    `INSERT INTO users(
      id, username, password_hash, role, disabled, created_at, updated_at
    ) VALUES ('owner', 'owner', 'unused', 'owner', 0, ?, ?)`,
  )
  .run(now, now);

beforeEach(() => {
  database.getDb().prepare("DELETE FROM login_attempts").run();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});

afterAll(() => {
  vi.useRealTimers();
  database.closeDb();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

describe("hourly login limits", () => {
  it("limits a source and username pair to six failed password checks per hour", async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await expect(failedLogin("missing", "192.0.2.10")).rejects.toMatchObject({
        status: 401,
        code: "invalid_credentials",
      });
    }

    await expect(failedLogin("missing", "192.0.2.10")).rejects.toMatchObject({
      status: 429,
      code: "login_rate_limited",
      retryAfterSeconds: 3600,
    });

    vi.advanceTimersByTime(60 * 60_000 + 1);
    await expect(failedLogin("missing", "192.0.2.10")).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    });
  });

  it("caps failures across usernames from the same source", async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      await expect(failedLogin(`missing-${attempt}`, "198.51.100.20")).rejects.toMatchObject({
        status: 401,
      });
    }

    await expect(failedLogin("another-user", "198.51.100.20")).rejects.toMatchObject({
      status: 429,
      code: "login_rate_limited",
    });
  });
});

async function failedLogin(username: string, ip: string) {
  return login({
    username,
    password: "incorrect password",
    ip,
    userAgent: "auth-test",
  });
}
