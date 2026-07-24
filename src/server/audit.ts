import crypto from "node:crypto";
import { getDb, nowIso } from "./db.ts";

export function audit(input: {
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  details?: Record<string, unknown>;
}): void {
  getDb()
    .prepare(
      `INSERT INTO audit_events(id, user_id, action, entity_type, entity_id, ip, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      crypto.randomUUID(),
      input.userId ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.ip ?? null,
      JSON.stringify(input.details ?? {}),
      nowIso(),
    );
}
