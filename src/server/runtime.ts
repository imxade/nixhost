import fs from "node:fs";
import { ensureSetupToken, purgeExpiredSessions } from "./auth.js";
import { CloudflareController } from "./cloudflare.js";
import { getDb, nowIso } from "./db.js";
import { DeploymentEngine } from "./deployment-engine.js";
import { events } from "./events.js";
import { GitReconciler } from "./git-reconciler.js";
import { logger } from "./logger.js";
import { LogRetentionController } from "./log-retention.js";
import { MetricsCollector } from "./metrics.js";
import { ensureDataDirectories, paths } from "./paths.js";
import { ProcessSupervisor } from "./process-supervisor.js";
import { captureProcessIdentity, matchesProcessIdentity } from "./process-identity.js";
import { ProxyManager } from "./proxy-manager.js";
import { queueDeployment } from "./app-service.js";
import type { AppRow, DeploymentRow } from "./types.js";

export class PlatformRuntime {
  readonly proxy = new ProxyManager();
  readonly supervisor = new ProcessSupervisor();
  readonly metrics = new MetricsCollector();
  readonly cloudflare = new CloudflareController();
  readonly deployments = new DeploymentEngine(this.supervisor, this.proxy);
  readonly git = new GitReconciler();
  readonly logRetention = new LogRetentionController();
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private closed = false;

  async boot(): Promise<void> {
    ensureDataDirectories();
    acquireRuntimeLock();
    getDb();
    ensureSetupToken();
    recoverDesiredState(this.supervisor);
    await this.proxy.reconcile();
    this.supervisor.boot();
    this.metrics.boot();
    await this.deployments.boot();
    this.git.boot();
    this.logRetention.boot();
    await this.cloudflare.boot();
    this.maintenanceTimer = setInterval(() => this.maintenance(), 60_000);
    this.maintenanceTimer.unref();
    events.publish("runtime.ready", "system", { pid: process.pid, dataDir: paths.data });
    logger.info("NixHost runtime ready", { pid: process.pid, dataDir: paths.data });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.git.close();
    this.logRetention.close();
    this.metrics.close();
    await this.deployments.close();
    await this.supervisor.close();
    await this.proxy.close();
    this.cloudflare.close();
    releaseRuntimeLock();
  }

  async stopApplication(appId: string): Promise<void> {
    const app = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(appId) as AppRow | undefined;
    if (!app) throw new Error("Application not found");
    const stoppedAt = nowIso();
    getDb().prepare("UPDATE applications SET desired_state = 'stopped', active_internal_port = NULL, active_deployment_id = NULL, updated_at = ? WHERE id = ?").run(stoppedAt, appId);
    if (app.active_deployment_id) {
      await this.supervisor.stopDeployment(app.active_deployment_id);
      getDb().prepare("UPDATE deployments SET state = 'superseded', finished_at = ? WHERE id = ? AND state = 'running'").run(stoppedAt, app.active_deployment_id);
    }
    await this.proxy.reconcile();
    events.publish("application.stopped", `app:${appId}`, {});
  }

  async startApplication(appId: string): Promise<DeploymentRow> {
    const app = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(appId) as AppRow | undefined;
    if (!app) throw new Error("Application not found");
    getDb().prepare("UPDATE applications SET desired_state = 'running', updated_at = ? WHERE id = ?").run(nowIso(), appId);
    const latest = getDb().prepare(
      "SELECT * FROM deployments WHERE app_id = ? AND commit_sha IS NOT NULL ORDER BY COALESCE(activated_at, queued_at) DESC LIMIT 1",
    ).get(appId) as DeploymentRow | undefined;
    return queueDeployment(appId, {
      trigger: "restart",
      commitSha: latest?.commit_sha ?? null,
      requestedRef: latest?.commit_sha ?? app.branch,
    });
  }

  async restartApplication(appId: string): Promise<DeploymentRow> {
    await this.stopApplication(appId);
    return this.startApplication(appId);
  }

  private maintenance(): void {
    purgeExpiredSessions();
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    getDb().prepare("DELETE FROM webhook_deliveries WHERE received_at < ?").run(cutoff);
  }
}

declare global {
  var __nixhostRuntimePromise: Promise<PlatformRuntime> | undefined;
}

export function bootRuntime(): Promise<PlatformRuntime> {
  if (!globalThis.__nixhostRuntimePromise) {
    const runtime = new PlatformRuntime();
    globalThis.__nixhostRuntimePromise = runtime.boot().then(() => runtime).catch((error) => {
      globalThis.__nixhostRuntimePromise = undefined;
      throw error;
    });
  }
  return globalThis.__nixhostRuntimePromise;
}

export async function getRuntime(): Promise<PlatformRuntime> {
  return bootRuntime();
}

function recoverDesiredState(supervisor: ProcessSupervisor): void {
  const apps = getDb().prepare("SELECT * FROM applications WHERE desired_state = 'running'").all() as AppRow[];
  for (const app of apps) {
    if (app.active_deployment_id) {
      const active = getDb().prepare("SELECT * FROM deployments WHERE id = ?").get(app.active_deployment_id) as
        | DeploymentRow
        | undefined;
      if (active && supervisor.isAlive(active)) continue;
    }
    const pending = getDb()
      .prepare(
        `SELECT 1 FROM deployments WHERE app_id = ? AND state IN
         ('queued','preparing','fetching','evaluating','starting','health-checking','activating') LIMIT 1`,
      )
      .get(app.id);
    if (!pending) queueDeployment(app.id, { trigger: "restart", requestedRef: app.branch });
  }
}

function acquireRuntimeLock(): void {
  const lockPath = `${paths.runtime}/runtime.lock`;
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
        pid?: number;
        processGroupId?: number;
        startTicks?: string | null;
      };
      if (
        lock.pid &&
        lock.pid !== process.pid &&
        matchesProcessIdentity({
          pid: lock.pid,
          process_group_id: lock.processGroupId ?? lock.pid,
          process_start_ticks: lock.startTicks ?? null,
        })
      ) {
        throw new Error(`Another NixHost control plane is already running with PID ${lock.pid}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Another NixHost")) throw error;
    }
    fs.rmSync(lockPath, { force: true });
  }

  const identity = captureProcessIdentity(process.pid);
  fs.writeFileSync(
    lockPath,
    JSON.stringify({
      pid: process.pid,
      processGroupId: identity?.processGroupId ?? process.pid,
      startTicks: identity?.startTicks ?? null,
      startedAt: nowIso(),
    }),
    { mode: 0o600, flag: "wx" },
  );
}

function releaseRuntimeLock(): void {
  const lockPath = `${paths.runtime}/runtime.lock`;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
    if (lock.pid === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    // A missing or malformed lock is not recoverable during shutdown.
  }
}
