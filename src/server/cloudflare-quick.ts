import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import { spawnLogged } from "./command.ts";
import { getDb, setSetting, setting } from "./db.ts";
import { HttpError } from "./errors.ts";
import { logger } from "./logger.ts";
import { paths } from "./paths.ts";
import {
  captureProcessIdentity,
  matchesProcessIdentity,
  type ProcessIdentity,
} from "./process-identity.ts";

const ENABLED_SETTING = "cloudflare_quick_enabled";
const URL_SETTING = "cloudflare_quick_url";
const IDENTITY_SETTING = "cloudflare_quick_process_identity";

export class CloudflareQuickTunnel {
  private childProcess: ChildProcess | null = null;
  private processIdentity: ProcessIdentity | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private starting: Promise<string> | null = null;

  status(): { enabled: boolean; running: boolean; url: string | null } {
    const running = this.isRunning();
    return {
      enabled: setting(ENABLED_SETTING) === "1",
      running,
      url: running ? (setting(URL_SETTING) ?? null) : null,
    };
  }

  async enable(): Promise<string> {
    setSetting(ENABLED_SETTING, "1");
    try {
      return await this.start();
    } catch (error) {
      getDb().prepare("DELETE FROM settings WHERE key IN (?, ?)").run(ENABLED_SETTING, URL_SETTING);
      await this.stopProcess();
      throw error;
    }
  }

  async disable(): Promise<void> {
    getDb().prepare("DELETE FROM settings WHERE key IN (?, ?)").run(ENABLED_SETTING, URL_SETTING);
    await this.stopProcess();
  }

  async boot(): Promise<void> {
    if (setting(ENABLED_SETTING) === "1" && !this.isRunning()) {
      void this.start().catch((error) => {
        logger.warn("Unable to restore temporary Cloudflare tunnel", { error: String(error) });
      });
    }
    this.monitorTimer = setInterval(() => {
      if (setting(ENABLED_SETTING) === "1" && !this.isRunning() && !this.starting) {
        void this.start().catch((error) => {
          logger.warn("Unable to restart temporary Cloudflare tunnel", { error: String(error) });
        });
      }
    }, 10_000);
    this.monitorTimer.unref();
  }

  close(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }

  private start(): Promise<string> {
    if (this.starting) return this.starting;
    const existing = this.status();
    if (existing.running && existing.url) return Promise.resolve(existing.url);
    this.starting = this.spawn().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async spawn(): Promise<string> {
    const log = `${paths.logs}/cloudflared-quick.log`;
    const logOffset = fileSize(log);
    const child = spawnLogged(
      "cloudflared",
      ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${process.env.PORT || 3000}`],
      {
        cwd: paths.runtime,
        env: process.env,
        stdoutPath: log,
        stderrPath: log,
        detached: true,
      },
    );
    if (!child.pid) throw new Error("cloudflared did not return a process ID");
    const identity = captureProcessIdentity(child.pid);
    if (!identity) {
      stopIdentity({ pid: child.pid, processGroupId: child.pid });
      throw new Error("Unable to establish a safe identity for the temporary Cloudflare tunnel");
    }
    this.childProcess = child;
    this.processIdentity = identity;
    setSetting(IDENTITY_SETTING, JSON.stringify(identity));
    child.unref();
    child.once("exit", (code, signal) => {
      logger.warn("Temporary cloudflared tunnel exited", { code, signal });
      this.childProcess = null;
      this.processIdentity = null;
      getDb()
        .prepare("DELETE FROM settings WHERE key IN (?, ?)")
        .run(IDENTITY_SETTING, URL_SETTING);
    });
    const url = await waitForQuickTunnelUrl(log, logOffset, child);
    setSetting(URL_SETTING, url);
    return url;
  }

  private async stopProcess(): Promise<void> {
    const identity = this.processIdentity ?? storedIdentity();
    const currentChildAlive = Boolean(
      this.childProcess?.pid &&
        this.childProcess.exitCode === null &&
        identity?.pid === this.childProcess.pid,
    );
    if (identity && (currentChildAlive || matchesProcessIdentity(toStoredIdentity(identity)))) {
      stopIdentity(identity);
    }
    this.childProcess = null;
    this.processIdentity = null;
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(IDENTITY_SETTING);
  }

  private isRunning(): boolean {
    if (this.childProcess && this.childProcess.exitCode === null) return true;
    const identity = storedIdentity();
    if (identity && matchesProcessIdentity(toStoredIdentity(identity))) {
      this.processIdentity = identity;
      return true;
    }
    this.processIdentity = null;
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(IDENTITY_SETTING);
    return false;
  }
}

export function parseQuickTunnelUrl(value: string): string | null {
  return value.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i)?.[0] ?? null;
}

async function waitForQuickTunnelUrl(
  log: string,
  offset: number,
  child: ChildProcess,
): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new HttpError(
        502,
        "Cloudflare Quick Tunnel exited before assigning a URL",
        "cloudflare_quick_failed",
      );
    }
    try {
      const size = fileSize(log);
      const start = Math.max(offset, size - 256 * 1024);
      const fd = fs.openSync(log, "r");
      let buffer: Buffer;
      try {
        buffer = Buffer.alloc(Math.max(0, size - start));
        fs.readSync(fd, buffer, 0, buffer.length, start);
      } finally {
        fs.closeSync(fd);
      }
      const url = parseQuickTunnelUrl(buffer.toString("utf8"));
      if (url) return url;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new HttpError(
    504,
    "Cloudflare did not assign a temporary URL within 30 seconds",
    "cloudflare_quick_timeout",
  );
}

function fileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function storedIdentity(): ProcessIdentity | null {
  const encoded = setting(IDENTITY_SETTING);
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

function stopIdentity(identity: Pick<ProcessIdentity, "pid" | "processGroupId">): void {
  try {
    process.kill(process.platform === "win32" ? identity.pid : -identity.processGroupId, "SIGTERM");
  } catch {}
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
