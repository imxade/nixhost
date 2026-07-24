import crypto from "node:crypto";
import fs from "node:fs";
import { audit } from "./audit.ts";
import {
  hashPassword,
  randomToken,
  sha256,
  timingSafeEqualText,
  verifyPassword,
} from "./crypto.ts";
import { getDb, nowIso, setSetting, setting } from "./db.ts";
import { HttpError } from "./errors.ts";
import { logger } from "./logger.ts";
import { paths } from "./paths.ts";
import type { Role, SessionRow, UserRow } from "./types.ts";

const SESSION_DAYS = 14;
const MAX_FAILURES = 6;
const BLOCK_MINUTES = 15;

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
}

export function isSetupComplete(): boolean {
  const row = getDb().prepare("SELECT 1 AS present FROM users LIMIT 1").get() as
    | { present: number }
    | undefined;
  return Boolean(row);
}

export function ensureSetupToken(): void {
  if (isSetupComplete()) {
    if (fs.existsSync(paths.setupTokenFile)) fs.rmSync(paths.setupTokenFile, { force: true });
    return;
  }
  if (setting("setup_token_hash")) return;
  const token = randomToken(24);
  setSetting("setup_token_hash", sha256(token));
  fs.writeFileSync(paths.setupTokenFile, `${token}\n`, { mode: 0o600 });
  logger.warn("NixHost first-run setup token", {
    token,
    file: paths.setupTokenFile,
  });
}

export async function completeSetup(input: {
  token: string;
  username: string;
  password: string;
  ip?: string | null;
}): Promise<AuthenticatedUser> {
  if (isSetupComplete())
    throw new HttpError(409, "Setup has already been completed", "setup_complete");
  const expected = setting("setup_token_hash");
  if (!expected || !timingSafeEqualText(sha256(input.token), expected)) {
    throw new HttpError(401, "The setup token is invalid", "invalid_setup_token");
  }
  const username = normalizeUsername(input.username);
  validatePassword(input.password);
  const user: AuthenticatedUser = {
    id: crypto.randomUUID(),
    username,
    role: "owner",
  };
  const now = nowIso();
  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
       VALUES (?, ?, ?, 'owner', 0, ?, ?)`,
    ).run(user.id, username, passwordHash, now, now);
    db.prepare("DELETE FROM settings WHERE key = 'setup_token_hash'").run();
  })();
  fs.rmSync(paths.setupTokenFile, { force: true });
  audit({
    userId: user.id,
    action: "setup.completed",
    entityType: "user",
    entityId: user.id,
    ip: input.ip,
  });
  return user;
}

export async function login(input: {
  username: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; user: AuthenticatedUser; expiresAt: string }> {
  if (!isSetupComplete())
    throw new HttpError(409, "Complete first-run setup before signing in", "setup_required");
  const username = normalizeUsername(input.username);
  const key = sha256(`${input.ip ?? "unknown"}\n${username}`);
  enforceLoginRateLimit(key);
  const user = getDb()
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(username) as UserRow | undefined;
  const valid =
    user && !user.disabled ? await verifyPassword(input.password, user.password_hash) : false;
  if (!valid || !user) {
    recordLoginFailure(key);
    audit({ action: "auth.login_failed", ip: input.ip, details: { username } });
    throw new HttpError(401, "Invalid username or password", "invalid_credentials");
  }
  clearLoginFailures(key);
  const session = createSession(user.id, input.ip, input.userAgent);
  audit({
    userId: user.id,
    action: "auth.login",
    entityType: "session",
    entityId: session.id,
    ip: input.ip,
  });
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: user.id, username: user.username, role: user.role },
  };
}

export function createSession(
  userId: string,
  ip?: string | null,
  userAgent?: string | null,
): { id: string; token: string; expiresAt: string } {
  const id = crypto.randomUUID();
  const token = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400_000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      userId,
      sha256(token),
      expiresAt,
      now.toISOString(),
      now.toISOString(),
      ip ?? null,
      userAgent ?? null,
    );
  return { id, token, expiresAt };
}

export function authenticateSession(token: string | undefined): AuthenticatedUser | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT s.*, u.username, u.role, u.disabled
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), nowIso()) as
    | (SessionRow & { username: string; role: Role; disabled: number })
    | undefined;
  if (!row || row.disabled) return null;
  const lastSeen = Date.parse(row.last_seen_at);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 5 * 60_000) {
    getDb().prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), row.id);
  }
  return { id: row.user_id, username: row.username, role: row.role };
}

export function logout(token: string | undefined, ip?: string | null): void {
  if (!token) return;
  const row = getDb()
    .prepare("SELECT id, user_id FROM sessions WHERE token_hash = ?")
    .get(sha256(token)) as { id: string; user_id: string } | undefined;
  if (!row) return;
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(row.id);
  audit({
    userId: row.user_id,
    action: "auth.logout",
    entityType: "session",
    entityId: row.id,
    ip,
  });
}

export function requireRole(user: AuthenticatedUser, allowed: Role[]): void {
  if (!allowed.includes(user.role)) {
    throw new HttpError(403, "You do not have permission to perform this action", "forbidden");
  }
}

export function purgeExpiredSessions(): number {
  return getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso()).changes;
}

function normalizeUsername(value: string): string {
  const username = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username)) {
    throw new HttpError(
      400,
      "Username must be 3–64 characters and contain only letters, numbers, dots, underscores, or hyphens",
      "invalid_username",
    );
  }
  return username;
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 256) {
    throw new HttpError(
      400,
      "Password must contain between 12 and 256 characters",
      "invalid_password",
    );
  }
}

function enforceLoginRateLimit(key: string): void {
  const row = getDb()
    .prepare("SELECT blocked_until, updated_at FROM login_attempts WHERE key = ?")
    .get(key) as { blocked_until: string | null; updated_at: string } | undefined;
  if (!row) return;
  if (row.blocked_until && Date.parse(row.blocked_until) > Date.now()) {
    throw new HttpError(
      429,
      "Too many failed sign-in attempts. Try again later",
      "login_rate_limited",
    );
  }
  if (Date.now() - Date.parse(row.updated_at) >= BLOCK_MINUTES * 60_000) {
    getDb().prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
  }
}

function recordLoginFailure(key: string): void {
  const now = nowIso();
  const db = getDb();
  const current = db
    .prepare("SELECT failures, updated_at FROM login_attempts WHERE key = ?")
    .get(key) as { failures: number; updated_at: string } | undefined;
  const withinWindow =
    current && Date.now() - Date.parse(current.updated_at) < BLOCK_MINUTES * 60_000;
  const failures = (withinWindow ? current.failures : 0) + 1;
  const blockedUntil =
    failures >= MAX_FAILURES ? new Date(Date.now() + BLOCK_MINUTES * 60_000).toISOString() : null;
  db.prepare(
    `INSERT INTO login_attempts(key, failures, blocked_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at`,
  ).run(key, failures, blockedUntil, now);
}

function clearLoginFailures(key: string): void {
  getDb().prepare("DELETE FROM login_attempts WHERE key = ?").run(key);
}
