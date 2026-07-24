import type { ChildProcess } from "node:child_process";
import { normalizeDomain } from "./app-service.ts";
import { spawnLogged } from "./command.ts";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { getDb, nowIso, setSetting, setting } from "./db.ts";
import { HttpError } from "./errors.ts";
import { updateAppWebhook } from "./github.ts";
import { logger } from "./logger.ts";
import { paths } from "./paths.ts";
import {
  captureProcessIdentity,
  matchesProcessIdentity,
  type ProcessIdentity,
} from "./process-identity.ts";

interface CloudflareRow {
  account_id: string;
  zone_id: string;
  api_token_encrypted: string;
  tunnel_id: string | null;
  tunnel_name: string | null;
  tunnel_token_encrypted: string | null;
  dashboard_hostname: string | null;
  enabled: number;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
}

export interface CloudflareDomainRoute {
  appId: string;
  appName: string;
  hostname: string;
  publicPort: number;
  status: "not-configured" | "pending" | "managed" | "external" | "error";
  zoneId: string | null;
  lastError: string | null;
  lastSyncedAt: string | null;
}

export class CloudflareController {
  private childProcess: ChildProcess | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private processIdentity: ProcessIdentity | null = null;

  status(): {
    configured: boolean;
    enabled: boolean;
    running: boolean;
    tunnelId: string | null;
    dashboardHostname: string | null;
    routes: CloudflareDomainRoute[];
  } {
    const row = getCloudflareConfig();
    return {
      configured: Boolean(row),
      enabled: Boolean(row?.enabled),
      running: this.isRunning(),
      tunnelId: row?.tunnel_id ?? null,
      dashboardHostname: row?.dashboard_hostname ?? null,
      routes: cloudflareDomainRoutes(Boolean(row)),
    };
  }

  async configure(input: {
    accountId: string;
    zoneId: string;
    apiToken: string;
    tunnelName: string;
    dashboardHostname?: string;
  }): Promise<void> {
    const dashboardHostname = input.dashboardHostname
      ? normalizeDomain(input.dashboardHostname)
      : null;
    if (
      dashboardHostname &&
      getDb().prepare("SELECT 1 FROM application_domains WHERE hostname = ?").get(dashboardHostname)
    ) {
      throw new HttpError(
        409,
        "The dashboard hostname is already assigned to an application",
        "domain_already_assigned",
      );
    }
    const previous = getCloudflareConfig();
    const replaceTunnel = Boolean(
      previous &&
        (previous.account_id !== input.accountId || previous.tunnel_name !== input.tunnelName),
    );
    if (replaceTunnel) await this.stopProcess();
    const now = nowIso();
    getDb()
      .prepare(
        `INSERT INTO cloudflare_config(singleton, account_id, zone_id, api_token_encrypted, tunnel_name,
          dashboard_hostname, enabled, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET account_id=excluded.account_id, zone_id=excluded.zone_id,
          api_token_encrypted=excluded.api_token_encrypted, tunnel_name=excluded.tunnel_name,
          dashboard_hostname=excluded.dashboard_hostname,
          tunnel_id=CASE WHEN account_id != excluded.account_id OR tunnel_name != excluded.tunnel_name THEN NULL ELSE tunnel_id END,
          tunnel_token_encrypted=CASE WHEN account_id != excluded.account_id OR tunnel_name != excluded.tunnel_name THEN NULL ELSE tunnel_token_encrypted END,
          updated_at=excluded.updated_at`,
      )
      .run(
        input.accountId,
        input.zoneId,
        encryptSecret(input.apiToken),
        input.tunnelName,
        dashboardHostname,
        now,
        now,
      );
    await this.ensureTunnel();
    await this.syncIngress();
    if (dashboardHostname) {
      await updateAppWebhook(`https://${dashboardHostname}`).catch((error) =>
        logger.warn("GitHub webhook URL update failed", { error: String(error) }),
      );
    }
  }

  async enable(): Promise<void> {
    await this.ensureTunnel();
    await this.syncIngress();
    getDb()
      .prepare("UPDATE cloudflare_config SET enabled = 1, updated_at = ? WHERE singleton = 1")
      .run(nowIso());
    this.startProcess();
  }

  async disable(): Promise<void> {
    getDb()
      .prepare("UPDATE cloudflare_config SET enabled = 0, updated_at = ? WHERE singleton = 1")
      .run(nowIso());
    await this.stopProcess();
  }

  async boot(): Promise<void> {
    const row = getCloudflareConfig();
    if (row?.enabled) this.startProcess();
    this.monitorTimer = setInterval(() => {
      const current = getCloudflareConfig();
      if (current?.enabled && !this.isRunning()) this.startProcess();
    }, 10_000);
    this.monitorTimer.unref();
  }

  close(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }

  async syncIngress(): Promise<void> {
    const row = getCloudflareConfig();
    if (!row?.tunnel_id) return;
    const ingress: Array<{ hostname?: string; service: string }> = [];
    if (row.dashboard_hostname) {
      await ensureDnsRecord(row, row.dashboard_hostname, true);
      ingress.push({
        hostname: row.dashboard_hostname,
        service: `http://127.0.0.1:${process.env.PORT || 3000}`,
      });
    }
    const domains = getDb()
      .prepare(
        `SELECT d.hostname, d.app_id, a.public_port
         FROM application_domains d
         JOIN applications a ON a.id = d.app_id
         WHERE a.kind = 'web' AND a.public_port IS NOT NULL
         ORDER BY d.hostname`,
      )
      .all() as Array<{ hostname: string; app_id: string; public_port: number }>;
    await cleanupRemovedDomainRoutes(row, new Set(domains.map((domain) => domain.hostname)));
    for (const domain of domains) {
      const zoneId = await syncDomainRoute(row, domain);
      if (zoneId) {
        ingress.push({
          hostname: domain.hostname,
          service: `http://127.0.0.1:${domain.public_port}`,
        });
      }
    }
    ingress.push({ service: "http_status:404" });
    await cfRequest(row, `/accounts/${row.account_id}/cfd_tunnel/${row.tunnel_id}/configurations`, {
      method: "PUT",
      body: JSON.stringify({ config: { ingress } }),
    });
  }

  private async ensureTunnel(): Promise<void> {
    const row = getCloudflareConfig();
    if (!row) throw new HttpError(409, "Cloudflare is not configured", "cloudflare_not_configured");
    if (row.tunnel_id && row.tunnel_token_encrypted) return;
    const created = await cfRequest<{ id: string }>(row, `/accounts/${row.account_id}/cfd_tunnel`, {
      method: "POST",
      body: JSON.stringify({ name: row.tunnel_name || "nixhost", config_src: "cloudflare" }),
    });
    const token = await cfRequest<string>(
      row,
      `/accounts/${row.account_id}/cfd_tunnel/${created.id}/token`,
    );
    getDb()
      .prepare(
        "UPDATE cloudflare_config SET tunnel_id = ?, tunnel_token_encrypted = ?, updated_at = ? WHERE singleton = 1",
      )
      .run(created.id, encryptSecret(token), nowIso());
  }

  private startProcess(): void {
    if (this.isRunning()) return;
    const row = getCloudflareConfig();
    if (!row?.tunnel_token_encrypted) throw new Error("Cloudflare tunnel token is unavailable");
    const log = `${paths.logs}/cloudflared.log`;
    const child = spawnLogged("cloudflared", ["tunnel", "--no-autoupdate", "run"], {
      cwd: paths.data,
      env: {
        ...process.env,
        TUNNEL_TOKEN: decryptSecret(row.tunnel_token_encrypted),
      },
      stdoutPath: log,
      stderrPath: log,
      detached: true,
    });
    if (!child.pid) throw new Error("cloudflared did not return a process ID");
    const identity = captureProcessIdentity(child.pid);
    if (!identity) {
      try {
        process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGKILL");
      } catch {}
      throw new Error("Unable to establish a safe identity for cloudflared");
    }
    this.childProcess = child;
    this.processIdentity = identity;
    setSetting("cloudflared_process_identity", JSON.stringify(identity));
    child.unref();
    child.once("exit", (code, signal) => {
      logger.warn("cloudflared exited", { code, signal });
      this.childProcess = null;
      this.processIdentity = null;
      getDb().prepare("DELETE FROM settings WHERE key = 'cloudflared_process_identity'").run();
      const current = getCloudflareConfig();
      if (current?.enabled) setTimeout(() => this.startProcess(), 10_000).unref();
    });
  }

  private async stopProcess(): Promise<void> {
    const identity = this.processIdentity ?? storedCloudflaredIdentity();
    const currentChildAlive = Boolean(
      this.childProcess?.pid &&
        this.childProcess.exitCode === null &&
        identity?.pid === this.childProcess.pid,
    );
    if (identity && (currentChildAlive || matchesProcessIdentity(toStoredIdentity(identity)))) {
      try {
        process.kill(
          process.platform === "win32" ? identity.pid : -identity.processGroupId,
          "SIGTERM",
        );
      } catch {}
    }
    this.childProcess = null;
    this.processIdentity = null;
    getDb().prepare("DELETE FROM settings WHERE key = 'cloudflared_process_identity'").run();
  }

  private isRunning(): boolean {
    if (this.childProcess && this.childProcess.exitCode === null) return true;
    const identity = storedCloudflaredIdentity();
    if (identity && matchesProcessIdentity(toStoredIdentity(identity))) {
      this.processIdentity = identity;
      return true;
    }
    this.processIdentity = null;
    getDb().prepare("DELETE FROM settings WHERE key = 'cloudflared_process_identity'").run();
    return false;
  }
}

function storedCloudflaredIdentity(): ProcessIdentity | null {
  const encoded = setting("cloudflared_process_identity");
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(encoded) as ProcessIdentity;
    return Number.isSafeInteger(parsed.pid) && Number.isSafeInteger(parsed.processGroupId)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function toStoredIdentity(identity: ProcessIdentity) {
  return {
    pid: identity.pid,
    process_group_id: identity.processGroupId,
    process_start_ticks: identity.startTicks,
    process_command_hash: identity.commandHash,
    process_command_summary: identity.commandSummary,
  };
}

export function getCloudflareConfig(): CloudflareRow | null {
  return (
    (getDb().prepare("SELECT * FROM cloudflare_config WHERE singleton = 1").get() as
      | CloudflareRow
      | undefined) ?? null
  );
}

export function cloudflareDomainRoutes(configured = Boolean(getCloudflareConfig())) {
  const rows = getDb()
    .prepare(
      `SELECT d.hostname, d.app_id, a.name AS app_name, a.public_port,
        s.status, s.zone_id, s.last_error, s.last_synced_at
       FROM application_domains d
       JOIN applications a ON a.id = d.app_id
       LEFT JOIN cloudflare_domain_status s ON s.hostname = d.hostname
       WHERE a.kind = 'web' AND a.public_port IS NOT NULL
       ORDER BY a.name COLLATE NOCASE, d.hostname`,
    )
    .all() as Array<{
    hostname: string;
    app_id: string;
    app_name: string;
    public_port: number;
    status: "managed" | "external" | "error" | null;
    zone_id: string | null;
    last_error: string | null;
    last_synced_at: string | null;
  }>;
  return rows.map(
    (row): CloudflareDomainRoute => ({
      appId: row.app_id,
      appName: row.app_name,
      hostname: row.hostname,
      publicPort: row.public_port,
      status: configured ? (row.status ?? "pending") : "not-configured",
      zoneId: row.zone_id,
      lastError: row.last_error,
      lastSyncedAt: row.last_synced_at,
    }),
  );
}

async function cfRequest<T>(row: CloudflareRow, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${decryptSecret(row.api_token_encrypted)}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as CloudflareResponse<T>;
  if (!response.ok || !body.success) {
    throw new HttpError(
      502,
      body.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(", ") || "Cloudflare API request failed",
      "cloudflare_api_failed",
    );
  }
  return body.result;
}

async function ensureDnsRecord(
  row: CloudflareRow,
  hostname: string,
  required: boolean,
): Promise<string | null> {
  if (!row.tunnel_id) return null;
  const zoneId = await zoneForHostname(row, hostname);
  if (!zoneId) {
    if (required) {
      throw new HttpError(
        400,
        `Cloudflare cannot manage DNS for ${hostname}; grant this token access to that zone`,
        "cloudflare_zone_not_found",
      );
    }
    logger.info("Skipping externally managed application domain during Cloudflare sync", {
      hostname,
    });
    return null;
  }
  const query = await cfRequest<Array<{ id: string; content: string }>>(
    row,
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
  );
  const data = {
    type: "CNAME",
    name: hostname,
    content: `${row.tunnel_id}.cfargotunnel.com`,
    proxied: true,
    ttl: 1,
    comment: "Managed by NixHost",
  };
  if (query[0]) {
    await cfRequest(row, `/zones/${zoneId}/dns_records/${query[0].id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  } else {
    await cfRequest(row, `/zones/${zoneId}/dns_records`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
  return zoneId;
}

async function syncDomainRoute(
  row: CloudflareRow,
  domain: { hostname: string; app_id: string },
): Promise<string | null> {
  try {
    const zoneId = await ensureDnsRecord(row, domain.hostname, false);
    recordDomainStatus(domain.hostname, domain.app_id, zoneId ? "managed" : "external", zoneId);
    return zoneId;
  } catch (error) {
    recordDomainStatus(
      domain.hostname,
      domain.app_id,
      "error",
      null,
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

function recordDomainStatus(
  hostname: string,
  appId: string,
  status: "managed" | "external" | "error",
  zoneId: string | null,
  lastError: string | null = null,
): void {
  getDb()
    .prepare(
      `INSERT INTO cloudflare_domain_status(
        hostname, app_id, status, zone_id, last_error, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(hostname) DO UPDATE SET
        app_id = excluded.app_id,
        status = excluded.status,
        zone_id = excluded.zone_id,
        last_error = excluded.last_error,
        last_synced_at = excluded.last_synced_at`,
    )
    .run(hostname, appId, status, zoneId, lastError, nowIso());
}

async function cleanupRemovedDomainRoutes(
  row: CloudflareRow,
  activeHostnames: Set<string>,
): Promise<void> {
  const stale = getDb()
    .prepare("SELECT hostname, status FROM cloudflare_domain_status ORDER BY hostname")
    .all() as Array<{ hostname: string; status: "managed" | "external" | "error" }>;
  for (const route of stale) {
    if (activeHostnames.has(route.hostname)) continue;
    if (route.status === "managed") await deleteManagedDnsRecord(row, route.hostname);
    getDb().prepare("DELETE FROM cloudflare_domain_status WHERE hostname = ?").run(route.hostname);
  }
}

async function deleteManagedDnsRecord(row: CloudflareRow, hostname: string): Promise<void> {
  if (!row.tunnel_id) return;
  const zoneId = await zoneForHostname(row, hostname);
  if (!zoneId) return;
  const records = await cfRequest<Array<{ id: string; content: string; comment?: string | null }>>(
    row,
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
  );
  const expectedContent = `${row.tunnel_id}.cfargotunnel.com`;
  for (const record of records) {
    if (record.content !== expectedContent && record.comment !== "Managed by NixHost") continue;
    await cfRequest(row, `/zones/${zoneId}/dns_records/${record.id}`, { method: "DELETE" });
  }
}

async function zoneForHostname(row: CloudflareRow, hostname: string): Promise<string | null> {
  const configured = await cfRequest<{ id: string; name: string }>(row, `/zones/${row.zone_id}`);
  if (hostname === configured.name || hostname.endsWith(`.${configured.name}`)) {
    return configured.id;
  }

  const labels = hostname.split(".");
  for (let index = 0; index <= labels.length - 2; index++) {
    const candidate = labels.slice(index).join(".");
    const zones = await cfRequest<Array<{ id: string; name: string }>>(
      row,
      `/zones?account.id=${encodeURIComponent(row.account_id)}&name=${encodeURIComponent(candidate)}&status=active&per_page=1`,
    );
    if (zones[0]) return zones[0].id;
  }
  return null;
}
