import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "./audit.ts";
import { hashPassword } from "./crypto.ts";
import { getDb, nowIso } from "./db.ts";
import { HttpError } from "./errors.ts";
import type { Role, UserRow } from "./types.ts";

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/),
  password: z.string().min(12).max(256),
  role: z.enum(["admin", "operator", "viewer"]),
});
const updateSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"]).optional(),
  disabled: z.boolean().optional(),
  password: z.string().min(12).max(256).optional(),
});

export function listUsers(): Array<Omit<UserRow, "password_hash">> {
  return getDb()
    .prepare(
      "SELECT id, username, role, disabled, created_at, updated_at FROM users ORDER BY created_at",
    )
    .all() as Array<Omit<UserRow, "password_hash">>;
}

export async function createUser(raw: unknown, actor: { id: string; ip?: string | null }) {
  const input = createSchema.parse(raw);
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    getDb()
      .prepare(
        "INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      )
      .run(id, input.username, await hashPassword(input.password), input.role, now, now);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      throw new HttpError(409, "Username already exists", "username_exists");
    throw error;
  }
  audit({
    userId: actor.id,
    ip: actor.ip,
    action: "user.created",
    entityType: "user",
    entityId: id,
    details: { username: input.username, role: input.role },
  });
  return getPublicUser(id);
}

export async function updateUser(
  id: string,
  raw: unknown,
  actor: { id: string; ip?: string | null },
) {
  const input = updateSchema.parse(raw);
  const target = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!target) throw new HttpError(404, "User not found", "user_not_found");
  if (target.role === "owner" && (input.disabled || input.role))
    throw new HttpError(400, "The owner account cannot be disabled or demoted", "owner_protected");
  if (target.role === "owner" && input.password) {
    throw new HttpError(
      400,
      "The owner must change their password from Account settings",
      "owner_password_self_service",
    );
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    updates.push(`${column} = ?`);
    values.push(value);
  };
  if (input.role) add("role", input.role as Role);
  if (input.disabled !== undefined) add("disabled", input.disabled ? 1 : 0);
  if (input.password) add("password_hash", await hashPassword(input.password));
  if (updates.length) {
    add("updated_at", nowIso());
    getDb()
      .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values, id);
    if (input.disabled) getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  }
  audit({
    userId: actor.id,
    ip: actor.ip,
    action: "user.updated",
    entityType: "user",
    entityId: id,
    details: { fields: Object.keys(input) },
  });
  return getPublicUser(id);
}

function getPublicUser(id: string): Omit<UserRow, "password_hash"> {
  const user = listUsers().find((candidate) => candidate.id === id);
  if (!user) throw new Error(`User disappeared after persistence: ${id}`);
  return user;
}
