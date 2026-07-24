import { config } from "./config.js";
import { getDb } from "./db.js";
import { repositoryHead, gitAuthenticationEnvironment } from "./github.js";
import { runCommand } from "./command.js";
import { queueDeployment } from "./app-service.js";
import { events } from "./events.js";
import { logger } from "./logger.js";
import type { AppRow, DeploymentRow } from "./types.js";

export class GitReconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  boot(): void {
    this.timer = setInterval(() => void this.reconcile(), config.NIXHOST_GIT_POLL_SECONDS * 1000);
    this.timer.unref();
    setTimeout(() => void this.reconcile(), 5000).unref();
  }

  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const apps = getDb().prepare("SELECT * FROM applications WHERE auto_deploy = 1").all() as AppRow[];
      for (const app of apps) {
        try {
          const head = await remoteHead(app);
          const active = app.active_deployment_id
            ? (getDb().prepare("SELECT * FROM deployments WHERE id = ?").get(app.active_deployment_id) as DeploymentRow | undefined)
            : undefined;
          const pending = getDb()
            .prepare(
              `SELECT 1 FROM deployments WHERE app_id = ? AND state IN
               ('queued','preparing','fetching','evaluating','starting','health-checking','activating') AND commit_sha = ? LIMIT 1`,
            )
            .get(app.id, head);
          if (active?.commit_sha !== head && !pending) {
            const deployment = queueDeployment(app.id, { commitSha: head, requestedRef: head, trigger: "reconcile" });
            events.publish("deployment.queued", `app:${app.id}`, { deploymentId: deployment.id, commit: head, trigger: "reconcile" });
          }
        } catch (error) {
          logger.warn("Git reconciliation failed", { appId: app.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    } finally {
      this.running = false;
    }
  }
}

async function remoteHead(app: AppRow): Promise<string> {
  if (app.github_installation_id) return repositoryHead(app.repository_url, app.github_installation_id, app.branch);
  const result = await runCommand("git", ["ls-remote", app.repository_url, `refs/heads/${app.branch}`], {
    env: gitAuthenticationEnvironment(),
    timeoutMs: 60_000,
  });
  if (result.code !== 0) throw new Error(result.stderr || "git ls-remote failed");
  const sha = result.stdout.trim().split(/\s+/)[0];
  if (!sha) throw new Error(`Branch '${app.branch}' was not found`);
  return sha;
}
