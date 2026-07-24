import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repositoryUrl = process.env.NIXHOST_PUBLIC_TEST_REPOSITORY_URL?.trim();
if (!repositoryUrl || !/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\.git)?$/i.test(repositoryUrl)) {
  throw new Error(
    "Set NIXHOST_PUBLIC_TEST_REPOSITORY_URL to a dedicated public GitHub test repository",
  );
}
if (process.env.NIXHOST_PUBLIC_TEST_PUSH !== "1") {
  throw new Error(
    "Set NIXHOST_PUBLIC_TEST_PUSH=1 to acknowledge that this test pushes a marker commit",
  );
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-public-github-"));
const pusher = path.join(root, "pusher");
process.env.NIXHOST_DATA_DIR = path.join(root, "data");
process.env.NIXHOST_MASTER_KEY = Buffer.alloc(32, 37).toString("base64");
process.env.NIXHOST_MIN_FREE_DISK_MB = "128";
process.env.NIXHOST_MIN_FREE_MEMORY_MB = "64";
process.env.NIXHOST_GIT_POLL_SECONDS = "86400";
process.env.NIXHOST_METRICS_SECONDS = "2";

const [{ PlatformRuntime }, database, appService] = await Promise.all([
  import("../../src/server/runtime.ts"),
  import("../../src/server/db.ts"),
  import("../../src/server/app-service.ts"),
]);

let runtime: InstanceType<typeof PlatformRuntime> | null = null;
let appId: string | null = null;

try {
  run("git", ["clone", repositoryUrl, pusher]);
  git(pusher, ["config", "user.name", "NixHost push redeployment test"]);
  git(pusher, ["config", "user.email", "nixhost-test@users.noreply.github.com"]);
  const branch = git(pusher, ["branch", "--show-current"]).trim();
  assert.ok(branch, "The public fixture clone did not select its remote default branch");
  const firstCommit = git(pusher, ["rev-parse", "HEAD"]).trim();

  runtime = new PlatformRuntime();
  await runtime.boot();
  const application = await appService.createApplication({
    name: "Public GitHub redeployment fixture",
    repositoryUrl,
    flakeOutput: "default",
    kind: "web",
    healthPath: "/health",
    autoDeploy: true,
  });
  appId = application.id;
  assert.equal(application.branch, branch);
  assert.ok(application.public_port);
  await runtime.proxy.reconcile();

  const first = appService.queueDeployment(application.id, {
    trigger: "manual",
    commitSha: firstCommit,
    requestedRef: firstCommit,
  });
  const firstRunning = await waitForCommit(application.id, firstCommit, 180_000);
  assert.equal(firstRunning.id, first.id);
  assert.equal(firstRunning.state, "running");
  await assertHealthy(application.public_port);

  const marker = new Date().toISOString();
  fs.writeFileSync(path.join(pusher, ".nixhost-redeploy-marker"), `${marker}\n`);
  git(pusher, ["add", ".nixhost-redeploy-marker"]);
  git(pusher, ["commit", "-m", `test: verify NixHost push redeployment ${marker}`]);
  const pushedCommit = git(pusher, ["rev-parse", "HEAD"]).trim();
  assert.notEqual(pushedCommit, firstCommit);
  git(pusher, ["push", "origin", `HEAD:${branch}`]);

  await runtime.git.reconcile();
  const redeployed = await waitForCommit(application.id, pushedCommit, 180_000);
  assert.equal(redeployed.state, "running");
  assert.equal(redeployed.trigger, "reconcile");
  const active = database
    .getDb()
    .prepare("SELECT active_deployment_id FROM applications WHERE id = ?")
    .get(application.id) as { active_deployment_id: string };
  assert.equal(active.active_deployment_id, redeployed.id);
  assert.equal(
    (
      database.getDb().prepare("SELECT state FROM deployments WHERE id = ?").get(first.id) as {
        state: string;
      }
    ).state,
    "superseded",
  );
  await assertHealthy(application.public_port);

  console.log(
    JSON.stringify({
      repositoryUrl,
      branch,
      initialCommit: firstCommit,
      pushedCommit,
      pushTriggeredRedeployment: true,
      exactCommitActivated: true,
      stableProxyHealthy: true,
    }),
  );
} finally {
  if (runtime) {
    if (appId) await runtime.stopApplication(appId).catch(() => undefined);
    await runtime.close().catch(() => undefined);
  }
  database.closeDb();
  fs.rmSync(root, { recursive: true, force: true });
}

function run(command: string, arguments_: string[]): string {
  return execFileSync(command, arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function git(repository: string, arguments_: string[]): string {
  return run("git", ["-C", repository, ...arguments_]);
}

async function waitForCommit(
  applicationId: string,
  commit: string,
  timeoutMs: number,
): Promise<{ id: string; state: string; trigger: string; failure_message: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deployment = database
      .getDb()
      .prepare(
        `SELECT id, state, trigger, failure_message
         FROM deployments
         WHERE app_id = ? AND commit_sha = ?
         ORDER BY queued_at DESC
         LIMIT 1`,
      )
      .get(applicationId, commit) as
      | { id: string; state: string; trigger: string; failure_message: string | null }
      | undefined;
    if (deployment?.state === "running") return deployment;
    if (
      deployment &&
      ["failed", "cancelled", "interrupted", "superseded"].includes(deployment.state)
    ) {
      throw new Error(
        `${commit} entered ${deployment.state}: ${deployment.failure_message ?? "unknown"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Commit ${commit} did not become active within ${timeoutMs}ms`);
}

async function assertHealthy(publicPort: number): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${publicPort}/health`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /"status":"ok"/);
}
