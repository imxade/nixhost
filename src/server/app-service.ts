import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "./audit.js";
import { encryptSecret } from "./crypto.js";
import { getDb, nowIso, setSetting, setting } from "./db.js";
import { HttpError } from "./errors.js";
import { allocatePublicPort } from "./ports.js";
import type { AppRow, DeploymentRow } from "./types.js";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  repositoryUrl: z
    .string()
    .trim()
    .url()
    .refine(isSupportedGitHubRepositoryUrl, "Use an HTTPS GitHub repository URL such as https://github.com/owner/repository.git"),
  branch: z.string().trim().min(1).max(200).default("main"),
  flakeOutput: z.string().trim().regex(/^[A-Za-z0-9._+-]+$/).default("default"),
  kind: z.enum(["web", "worker"]).default("web"),
  githubRepositoryId: z.number().int().positive().nullable().optional(),
  githubInstallationId: z.number().int().positive().nullable().optional(),
  autoDeploy: z.boolean().default(true),
  healthPath: z.string().trim().startsWith("/").max(500).default("/"),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  branch: z.string().trim().min(1).max(200).optional(),
  flakeOutput: z.string().trim().regex(/^[A-Za-z0-9._+-]+$/).optional(),
  autoDeploy: z.boolean().optional(),
  healthPath: z.string().trim().startsWith("/").max(500).optional(),
  restartPolicy: z.enum(["never", "on-failure", "always", "unless-stopped"]).optional(),
  domain: z.string().trim().max(253).optional().nullable(),
});

export async function createApplication(raw: unknown, actor?: { id: string; ip?: string | null }): Promise<AppRow> {
  const input = createSchema.parse(raw);
  input.repositoryUrl = normalizeGitHubRepositoryUrl(input.repositoryUrl);
  const id = crypto.randomUUID();
  const slug = uniqueSlug(input.name);
  const publicPort = input.kind === "web" ? await allocatePublicPort() : null;
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO applications(id, name, slug, kind, repository_url, branch, flake_output,
        github_repository_id, github_installation_id, auto_deploy, desired_state, restart_policy,
        health_path, health_timeout_seconds, startup_timeout_seconds, public_port, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', 'on-failure', ?, 5, 1800, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      slug,
      input.kind,
      input.repositoryUrl,
      input.branch,
      input.flakeOutput,
      input.githubRepositoryId ?? null,
      input.githubInstallationId ?? null,
      input.autoDeploy ? 1 : 0,
      input.healthPath,
      publicPort,
      now,
      now,
    );
  audit({
    userId: actor?.id,
    ip: actor?.ip,
    action: "application.created",
    entityType: "application",
    entityId: id,
    details: { name: input.name, repositoryUrl: input.repositoryUrl },
  });
  return getApplication(id);
}

export function listApplications(): AppRow[] {
  return getDb().prepare("SELECT * FROM applications ORDER BY created_at DESC").all() as AppRow[];
}

export function getApplication(id: string): AppRow {
  const app = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(id) as AppRow | undefined;
  if (!app) throw new HttpError(404, "Application not found", "application_not_found");
  return app;
}

export function getApplicationByRepositoryId(repositoryId: number): AppRow | null {
  return (
    (getDb().prepare("SELECT * FROM applications WHERE github_repository_id = ?").get(repositoryId) as
      | AppRow
      | undefined) ?? null
  );
}

export function updateApplication(
  id: string,
  raw: unknown,
  actor?: { id: string; ip?: string | null },
): AppRow {
  const input = updateSchema.parse(raw);
  const app = getApplication(id);
  const columns: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    values.push(value);
  };
  if (input.name !== undefined) add("name", input.name);
  if (input.branch !== undefined) add("branch", input.branch);
  if (input.flakeOutput !== undefined) add("flake_output", input.flakeOutput);
  if (input.autoDeploy !== undefined) add("auto_deploy", input.autoDeploy ? 1 : 0);
  if (input.healthPath !== undefined) add("health_path", input.healthPath);
  if (input.restartPolicy !== undefined) add("restart_policy", input.restartPolicy);
  if (columns.length) {
    add("updated_at", nowIso());
    getDb().prepare(`UPDATE applications SET ${columns.join(", ")} WHERE id = ?`).run(...values, id);
  }
  if (input.domain !== undefined) {
    const domain = input.domain?.toLowerCase() || "";
    if (domain && !isHostname(domain)) throw new HttpError(400, "Domain is not a valid hostname", "invalid_domain");
    if (domain) setSetting(`domain:${id}`, domain);
    else getDb().prepare("DELETE FROM settings WHERE key = ?").run(`domain:${id}`);
  }
  audit({
    userId: actor?.id,
    ip: actor?.ip,
    action: "application.updated",
    entityType: "application",
    entityId: id,
    details: { previousName: app.name, fields: Object.keys(input) },
  });
  return getApplication(id);
}

export function applicationDomain(id: string): string | null {
  return setting(`domain:${id}`) ?? null;
}

export function setEnvironment(
  appId: string,
  variables: Record<string, string>,
  secret = true,
  actor?: { id: string; ip?: string | null },
): void {
  getApplication(appId);
  const entries = Object.entries(variables);
  for (const [key, value] of entries) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) throw new HttpError(400, `Invalid environment variable name: ${key}`, "invalid_env_key");
    if (key.startsWith("NIXHOST_") || ["PORT", "HOST", "DATA_DIR", "CACHE_DIR", "LOG_DIR"].includes(key)) {
      throw new HttpError(400, `${key} is reserved by NixHost`, "reserved_env_key");
    }
    if (Buffer.byteLength(value) > 64 * 1024) throw new HttpError(400, `${key} exceeds 64 KiB`, "env_value_too_large");
  }
  const now = nowIso();
  const statement = getDb().prepare(
    `INSERT INTO app_environment(id, app_id, key, value_encrypted, secret, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(app_id, key) DO UPDATE SET value_encrypted=excluded.value_encrypted, secret=excluded.secret, updated_at=excluded.updated_at`,
  );
  getDb().transaction(() => {
    for (const [key, value] of entries) {
      statement.run(crypto.randomUUID(), appId, key, encryptSecret(value), secret ? 1 : 0, now, now);
    }
  })();
  audit({
    userId: actor?.id,
    ip: actor?.ip,
    action: "application.environment_updated",
    entityType: "application",
    entityId: appId,
    details: { keys: entries.map(([key]) => key) },
  });
}

export function environmentKeys(appId: string): Array<{ key: string; secret: boolean; updatedAt: string }> {
  return (
    getDb()
      .prepare("SELECT key, secret, updated_at FROM app_environment WHERE app_id = ? ORDER BY key")
      .all(appId) as Array<{ key: string; secret: number; updated_at: string }>
  ).map((row) => ({ key: row.key, secret: Boolean(row.secret), updatedAt: row.updated_at }));
}

export function removeEnvironmentKey(appId: string, key: string): void {
  getDb().prepare("DELETE FROM app_environment WHERE app_id = ? AND key = ?").run(appId, key);
}

export function queueDeployment(
  appId: string,
  input: { commitSha?: string | null; requestedRef?: string; trigger: DeploymentRow["trigger"] },
): DeploymentRow {
  const app = getApplication(appId);
  const db = getDb();
  db.prepare(
    `UPDATE deployments SET state = 'superseded', finished_at = ?
     WHERE app_id = ? AND state = 'queued'`,
  ).run(nowIso(), appId);
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO deployments(id, app_id, commit_sha, requested_ref, trigger, state, resource_confidence,
      queued_at, cancel_requested)
     VALUES (?, ?, ?, ?, ?, 'queued', 'none', ?, 0)`,
  ).run(id, appId, input.commitSha ?? null, input.requestedRef ?? app.branch, input.trigger, nowIso());
  return getDeployment(id);
}

export function getDeployment(id: string): DeploymentRow {
  const row = getDb().prepare("SELECT * FROM deployments WHERE id = ?").get(id) as DeploymentRow | undefined;
  if (!row) throw new HttpError(404, "Deployment not found", "deployment_not_found");
  return row;
}

export function listDeployments(appId?: string, limit = 50): DeploymentRow[] {
  if (appId) {
    return getDb()
      .prepare("SELECT * FROM deployments WHERE app_id = ? ORDER BY queued_at DESC LIMIT ?")
      .all(appId, limit) as DeploymentRow[];
  }
  return getDb().prepare("SELECT * FROM deployments ORDER BY queued_at DESC LIMIT ?").all(limit) as DeploymentRow[];
}

export function requestDeploymentCancellation(id: string): void {
  const deployment = getDeployment(id);
  if (["running", "failed", "cancelled", "superseded"].includes(deployment.state)) return;
  getDb().prepare("UPDATE deployments SET cancel_requested = 1 WHERE id = ?").run(id);
}

export function deleteApplication(id: string): void {
  getApplication(id);
  getDb().prepare("DELETE FROM applications WHERE id = ?").run(id);
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(`domain:${id}`);
}

function uniqueSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "app";
  for (let index = 0; index < 1000; index++) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const exists = getDb().prepare("SELECT 1 FROM applications WHERE slug = ?").get(candidate);
    if (!exists) return candidate;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
}

function isHostname(value: string): boolean {
  return value.length <= 253 && value.split(".").every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part));
}

function isSupportedGitHubRepositoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return false;
    if (url.username || url.password || url.port || url.search || url.hash) return false;
    const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    return segments.length === 2 && segments.every((segment) => /^[A-Za-z0-9_.-]+(?:\.git)?$/.test(segment));
  } catch {
    return false;
  }
}

function normalizeGitHubRepositoryUrl(value: string): string {
  const url = new URL(value);
  const segments = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const owner = segments[0] ?? "";
  const repository = (segments[1] ?? "").replace(/\.git$/i, "");
  return `https://github.com/${owner}/${repository}.git`;
}
