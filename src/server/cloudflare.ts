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
  } {
    const row = getCloudflareConfig();
    return {
      configured: Boolean(row),
      enabled: Boolean(row?.enabled),
      running: this.isRunning(),
      tunnelId: row?.tunnel_id ?? null,
      dashboardHostname: row?.dashboard_hostname ?? null,
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
        `SELECT d.hostname, a.public_port
         FROM application_domains d
         JOIN applications a ON a.id = d.app_id
         WHERE a.kind = 'web' AND a.public_port IS NOT NULL
         ORDER BY d.hostname`,
      )
      .all() as Array<{ hostname: string; public_port: number }>;
    for (const domain of domains) {
      if (!(await ensureDnsRecord(row, domain.hostname, false))) continue;
      ingress.push({
        hostname: domain.hostname,
        service: `http://127.0.0.1:${domain.public_port}`,
      });
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
): Promise<boolean> {
  if (!row.tunnel_id) return false;
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
    return false;
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
  return true;
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
