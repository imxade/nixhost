import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import { spawnLogged } from "./command.ts";
import { config } from "./config.ts";
import { getDb, nowIso } from "./db.ts";
import { events } from "./events.ts";
import { logger } from "./logger.ts";
import { paths } from "./paths.ts";
import {
  captureProcessIdentity,
  matchesProcessIdentity,
  type ProcessIdentity,
} from "./process-identity.ts";
import { synchronizeGitHubWebhook } from "./public-webhook.ts";
import { parseQuickTunnelUrl } from "./quick-tunnel-url.ts";
import type { AppRow } from "./types.ts";

export type QuickTunnelStatus = "starting" | "running" | "error";
export type QuickTunnelTargetType = "dashboard" | "application";

interface QuickTunnelRow {
  key: string;
  target_type: QuickTunnelTargetType;
  app_id: string | null;
  local_port: number;
  url: string | null;
  status: QuickTunnelStatus;
  pid: number | null;
  process_group_id: number | null;
  process_start_ticks: string | null;
  process_command_hash: string | null;
  process_command_summary: string | null;
  failure_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  started_at: string | null;
  updated_at: string;
}

interface QuickTunnelStatusRow extends QuickTunnelRow {
  app_name: string | null;
}

interface ManagedQuickTunnel {
  key: string;
  child: ChildProcess;
  identity: ProcessIdentity;
  expectedStop: boolean;
}

interface QuickTunnelTarget {
  key: string;
  targetType: QuickTunnelTargetType;
  appId: string | null;
  appName: string | null;
  localPort: number;
}

export interface QuickTunnelRoute {
  key: string;
  targetType: QuickTunnelTargetType;
  appId: string | null;
  appName: string | null;
  localPort: number;
  url: string | null;
  status: QuickTunnelStatus;
  running: boolean;
  lastError: string | null;
  startedAt: string | null;
  updatedAt: string;
}

const STARTUP_TIMEOUT_MS = 90_000;
const MAX_LOG_BYTES = 512 * 1024;
export class QuickTunnelController {
  private readonly managed = new Map<string, ManagedQuickTunnel>();
  private timer: NodeJS.Timeout | null = null;
  private reconciliation: Promise<void> | null = null;
  private closed = false;

  async boot(): Promise<void> {
    if (!config.NIXHOST_QUICK_TUNNELS_ENABLED) {
      await this.stopAllAndClear();
      return;
    }
    await this.reconcile();
    this.timer = setInterval(
      () => void this.reconcile(),
      config.NIXHOST_QUICK_TUNNEL_RECONCILE_SECONDS * 1000,
    );
    this.timer.unref();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.reconciliation) await this.reconciliation.catch(() => undefined);
    await this.stopAllAndClear();
  }

  status(): { enabled: boolean; routes: QuickTunnelRoute[] } {
    const rows = getDb()
      .prepare(
        `SELECT q.*, a.name AS app_name
         FROM quick_tunnels q
         LEFT JOIN applications a ON a.id = q.app_id
         ORDER BY q.target_type, q.key`,
      )
      .all() as QuickTunnelStatusRow[];
    return {
      enabled: config.NIXHOST_QUICK_TUNNELS_ENABLED,
      routes: rows.map((row) => {
        return {
          key: row.key,
          targetType: row.target_type,
          appId: row.app_id,
          appName: row.app_name,
          localPort: row.local_port,
          url: row.url,
          status: row.status,
          running: this.isRunning(row),
          lastError: row.last_error,
          startedAt: row.started_at,
          updatedAt: row.updated_at,
        };
      }),
    };
  }

  applicationRoute(appId: string): QuickTunnelRoute | null {
    return this.status().routes.find((route) => route.appId === appId) ?? null;
  }

  async removeApplication(appId: string): Promise<void> {
    const key = `app:${appId}`;
    const row = getQuickTunnel(key);
    if (!row) return;
    await this.stopRow(row);
    getDb().prepare("DELETE FROM quick_tunnels WHERE key = ?").run(key);
    events.publish("quick_tunnel.removed", `app:${appId}`, { key });
  }

  async reconcile(): Promise<void> {
    if (this.closed || !config.NIXHOST_QUICK_TUNNELS_ENABLED) return;
    if (this.reconciliation) return this.reconciliation;
    this.reconciliation = this.reconcileOnce().finally(() => {
      this.reconciliation = null;
    });
    return this.reconciliation;
  }

  private async reconcileOnce(): Promise<void> {
    const expected = targetMap();
    const existing = getDb().prepare("SELECT * FROM quick_tunnels").all() as QuickTunnelRow[];

    for (const row of existing) {
      const target = expected.get(row.key);
      if (!target) {
        await this.stopRow(row);
        getDb().prepare("DELETE FROM quick_tunnels WHERE key = ?").run(row.key);
        continue;
      }
      if (row.local_port !== target.localPort) {
        await this.stopRow(row);
        getDb().prepare("DELETE FROM quick_tunnels WHERE key = ?").run(row.key);
      }
    }

    for (const target of expected.values()) {
      await this.reconcileTarget(target);
    }
  }

  private async reconcileTarget(target: QuickTunnelTarget): Promise<void> {
    let row = getQuickTunnel(target.key);
    if (!row) {
      const now = nowIso();
      getDb()
        .prepare(
          `INSERT INTO quick_tunnels(
            key, target_type, app_id, local_port, status, updated_at
          ) VALUES (?, ?, ?, ?, 'starting', ?)`,
        )
        .run(target.key, target.targetType, target.appId, target.localPort, now);
      row = getQuickTunnel(target.key);
    }
    if (!row) return;

    const alive = this.isRunning(row);
    if (alive) {
      const discoveredUrl = row.url ?? readQuickTunnelUrl(logPath(target.key));
      if (discoveredUrl && (row.url !== discoveredUrl || row.status !== "running")) {
        getDb()
          .prepare(
            `UPDATE quick_tunnels SET url = ?, status = 'running', failure_count = 0,
             next_retry_at = NULL, last_error = NULL, updated_at = ? WHERE key = ?`,
          )
          .run(discoveredUrl, nowIso(), target.key);
        if (target.targetType === "dashboard") {
          void synchronizeGitHubWebhook().catch(() => undefined);
        }
        events.publish("quick_tunnel.ready", target.appId ? `app:${target.appId}` : "system", {
          key: target.key,
          url: discoveredUrl,
          localPort: target.localPort,
        });
      } else if (
        !discoveredUrl &&
        row.started_at &&
        Date.parse(row.started_at) + STARTUP_TIMEOUT_MS < Date.now()
      ) {
        await this.stopRow(row);
        this.recordFailure(target.key, "cloudflared did not publish a Quick Tunnel URL in time");
      }
      return;
    }

    if (row.pid || row.process_group_id) {
      this.managed.delete(row.key);
      this.recordFailure(
        row.key,
        row.last_error ?? "The Quick Tunnel process stopped unexpectedly",
      );
      row = getQuickTunnel(target.key);
      if (!row) return;
    }

    if (row.next_retry_at && Date.parse(row.next_retry_at) > Date.now()) return;
    await this.startTarget(target, row.failure_count);
  }

  private async startTarget(target: QuickTunnelTarget, previousFailures: number): Promise<void> {
    const log = logPath(target.key);
    fs.writeFileSync(log, "", { mode: 0o600 });
    const now = nowIso();
    getDb()
      .prepare(
        `UPDATE quick_tunnels SET url = NULL, status = 'starting', pid = NULL,
         process_group_id = NULL, process_start_ticks = NULL, process_command_hash = NULL,
         process_command_summary = NULL, last_error = NULL, started_at = ?, updated_at = ?
         WHERE key = ?`,
      )
      .run(now, now, target.key);

    let child: ChildProcess;
    try {
      child = spawnLogged(config.NIXHOST_CLOUDFLARED_BIN, quickTunnelArguments(target.localPort), {
        cwd: paths.data,
        env: process.env,
        stdoutPath: log,
        stderrPath: log,
        detached: true,
      });
    } catch (error) {
      this.recordFailure(target.key, errorMessage(error), previousFailures + 1);
      return;
    }

    let pid: number;
    try {
      pid = await spawnedProcessId(child);
    } catch (error) {
      this.recordFailure(target.key, cloudflaredStartError(error), previousFailures + 1);
      return;
    }

    let terminalHandled = false;
    child.once("error", (error) => {
      if (terminalHandled) return;
      terminalHandled = true;
      this.managed.delete(target.key);
      this.recordFailure(target.key, cloudflaredStartError(error), previousFailures + 1);
    });

    const identity = captureProcessIdentity(pid);
    if (!identity) {
      terminalHandled = true;
      terminateIdentity(
        {
          pid,
          processGroupId: pid,
          startTicks: null,
          commandHash: null,
          commandSummary: null,
        },
        "SIGKILL",
      );
      this.recordFailure(
        target.key,
        "Unable to establish a safe identity for the Quick Tunnel process",
        previousFailures + 1,
      );
      return;
    }

    const managed: ManagedQuickTunnel = {
      key: target.key,
      child,
      identity,
      expectedStop: false,
    };
    this.managed.set(target.key, managed);
    getDb()
      .prepare(
        `UPDATE quick_tunnels SET pid = ?, process_group_id = ?, process_start_ticks = ?,
         process_command_hash = ?, process_command_summary = ?, status = 'starting',
         updated_at = ? WHERE key = ?`,
      )
      .run(
        identity.pid,
        identity.processGroupId,
        identity.startTicks,
        identity.commandHash,
        identity.commandSummary,
        nowIso(),
        target.key,
      );
    child.unref();
    child.once("exit", (code, signal) => {
      if (terminalHandled) return;
      terminalHandled = true;
      this.managed.delete(target.key);
      if (managed.expectedStop) return;
      this.recordFailure(
        target.key,
        `cloudflared exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`,
      );
      events.publish("quick_tunnel.stopped", target.appId ? `app:${target.appId}` : "system", {
        key: target.key,
        code,
        signal,
      });
    });
  }

  private recordFailure(key: string, message: string, failureCount?: number): void {
    const current = getQuickTunnel(key);
    if (!current) return;
    const failures = failureCount ?? current.failure_count + 1;
    const delaySeconds = Math.min(300, 10 * 2 ** Math.min(failures - 1, 5));
    const retryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    getDb()
      .prepare(
        `UPDATE quick_tunnels SET url = NULL, status = 'error', pid = NULL,
         process_group_id = NULL, process_start_ticks = NULL, process_command_hash = NULL,
         process_command_summary = NULL, failure_count = ?, next_retry_at = ?, last_error = ?,
         updated_at = ? WHERE key = ?`,
      )
      .run(failures, retryAt, message.slice(0, 1000), nowIso(), key);
    if (key === "dashboard") void synchronizeGitHubWebhook().catch(() => undefined);
    logger.warn("Quick Tunnel unavailable", { key, error: message, retryAt });
  }

  private async stopRow(row: QuickTunnelRow): Promise<void> {
    const managed = this.managed.get(row.key);
    if (managed) managed.expectedStop = true;
    const identity = managed?.identity ?? rowIdentity(row);
    if (identity && this.isRunning(row)) {
      terminateIdentity(identity, "SIGTERM");
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline && this.isRunning(row)) await delay(100);
      if (this.isRunning(row)) terminateIdentity(identity, "SIGKILL");
    }
    this.managed.delete(row.key);
  }

  private isRunning(row: QuickTunnelRow): boolean {
    const managed = this.managed.get(row.key);
    if (
      managed?.child.pid === row.pid &&
      managed.child.exitCode === null &&
      managed.identity.startTicks === row.process_start_ticks
    ) {
      return true;
    }
    return matchesProcessIdentity({
      pid: row.pid,
      process_group_id: row.process_group_id,
      process_start_ticks: row.process_start_ticks,
      process_command_hash: row.process_command_hash,
      process_command_summary: row.process_command_summary,
    });
  }

  private async stopAllAndClear(): Promise<void> {
    const rows = getDb().prepare("SELECT * FROM quick_tunnels").all() as QuickTunnelRow[];
    for (const row of rows) await this.stopRow(row);
    getDb().prepare("DELETE FROM quick_tunnels").run();
  }
}

function targetMap(): Map<string, QuickTunnelTarget> {
  const targets = new Map<string, QuickTunnelTarget>();
  targets.set("dashboard", {
    key: "dashboard",
    targetType: "dashboard",
    appId: null,
    appName: null,
    localPort: config.PORT,
  });
  const apps = getDb()
    .prepare("SELECT * FROM applications WHERE kind = 'web' AND public_port IS NOT NULL")
    .all() as AppRow[];
  for (const app of apps) {
    if (!app.public_port) continue;
    targets.set(`app:${app.id}`, {
      key: `app:${app.id}`,
      targetType: "application",
      appId: app.id,
      appName: app.name,
      localPort: app.public_port,
    });
  }
  return targets;
}

function getQuickTunnel(key: string): QuickTunnelRow | null {
  return (
    (getDb().prepare("SELECT * FROM quick_tunnels WHERE key = ?").get(key) as
      | QuickTunnelRow
      | undefined) ?? null
  );
}

function readQuickTunnelUrl(file: string): string | null {
  let fd: number | null = null;
  try {
    const noFollow = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
    fd = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return null;
    const start = Math.max(0, stat.size - MAX_LOG_BYTES);
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return parseQuickTunnelUrl(buffer.toString("utf8"));
  } catch {
    return null;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

function logPath(key: string): string {
  return `${paths.logs}/quick-tunnel-${safeKey(key)}.log`;
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function rowIdentity(row: QuickTunnelRow): ProcessIdentity | null {
  if (!row.pid || !row.process_group_id) return null;
  return {
    pid: row.pid,
    processGroupId: row.process_group_id,
    startTicks: row.process_start_ticks,
    commandHash: row.process_command_hash,
    commandSummary: row.process_command_summary,
  };
}

function terminateIdentity(identity: ProcessIdentity, signal: NodeJS.Signals): void {
  try {
    process.kill(process.platform === "win32" ? identity.pid : -identity.processGroupId, signal);
  } catch {
    // The process may already have exited.
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function spawnedProcessId(child: ChildProcess): Promise<number> {
  if (child.pid) return child.pid;
  await new Promise<void>((resolve, reject) => {
    const onSpawn = (): void => {
      child.off("error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      child.off("spawn", onSpawn);
      reject(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
  if (!child.pid) throw new Error("cloudflared started without a process ID");
  return child.pid;
}

export function cloudflaredStartError(error: unknown): string {
  const message = errorMessage(error);
  if (
    message.includes("ENOENT") ||
    (error instanceof Error && "code" in error && error.code === "ENOENT")
  ) {
    return "Missing dependency: cloudflared. Install cloudflared or set NIXHOST_CLOUDFLARED_BIN to its absolute path.";
  }
  return `Unable to start cloudflared: ${message}`;
}

export function quickTunnelArguments(localPort: number): string[] {
  return [
    "tunnel",
    "--config",
    "/dev/null",
    "--no-autoupdate",
    "--loglevel",
    "info",
    "--output",
    "json",
    "--url",
    `http://127.0.0.1:${localPort}`,
  ];
}
