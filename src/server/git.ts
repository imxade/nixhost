import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./command.js";
import { HttpError } from "./errors.js";
import { appPaths } from "./paths.js";
import { gitAuthenticationEnvironment, installationToken } from "./github.js";
import type { AppRow } from "./types.js";

export async function prepareRelease(
  app: AppRow,
  deploymentId: string,
  requestedCommit?: string | null,
  signal?: AbortSignal,
): Promise<{ commit: string; releaseDir: string }> {
  const locations = appPaths(app.id, deploymentId);
  const repository = locations.repository;
  const releaseDir = locations.release!;
  const token = app.github_installation_id ? await installationToken(app.github_installation_id) : undefined;
  const env = gitAuthenticationEnvironment(token);
  if (!fs.existsSync(path.join(repository, "HEAD"))) {
    fs.rmSync(repository, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(repository), { recursive: true });
    const clone = await runCommand("git", ["clone", "--mirror", app.repository_url, repository], {
      env,
      timeoutMs: 10 * 60_000,
      signal,
    });
    if (clone.code !== 0) throw new HttpError(400, `Git clone failed: ${sanitize(clone.stderr)}`, "git_clone_failed");
  } else {
    await runCommand(
      "git",
      ["-C", repository, "remote", "set-url", "origin", app.repository_url],
      { env, signal },
    );
  }
  const fetch = await runCommand(
    "git",
    ["-C", repository, "fetch", "--prune", "origin", `+refs/heads/${app.branch}:refs/remotes/origin/${app.branch}`],
    { env, timeoutMs: 10 * 60_000, signal },
  );
  if (fetch.code !== 0) throw new HttpError(400, `Git fetch failed: ${sanitize(fetch.stderr)}`, "git_fetch_failed");
  const requested = requestedCommit || `refs/remotes/origin/${app.branch}`;
  const resolve = await runCommand("git", ["-C", repository, "rev-parse", "--verify", `${requested}^{commit}`], {
    env,
    timeoutMs: 30_000,
    signal,
  });
  if (resolve.code !== 0) throw new HttpError(400, "Requested Git commit does not exist", "git_commit_missing");
  const commit = resolve.stdout.trim();
  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(releaseDir), { recursive: true });
  const worktree = await runCommand(
    "git",
    ["-C", repository, "worktree", "add", "--force", "--detach", releaseDir, commit],
    { env, timeoutMs: 2 * 60_000, signal },
  );
  if (worktree.code !== 0) throw new HttpError(500, `Unable to create release: ${sanitize(worktree.stderr)}`, "git_worktree_failed");
  return { commit, releaseDir };
}

export async function removeReleaseWorktree(appId: string, releaseDir: string): Promise<void> {
  const repository = appPaths(appId).repository;
  await runCommand("git", ["-C", repository, "worktree", "remove", "--force", releaseDir], {
    timeoutMs: 60_000,
  }).catch(() => undefined);
  fs.rmSync(releaseDir, { recursive: true, force: true });
}

function sanitize(value: string): string {
  return value.replace(/Authorization:\s*Bearer\s+\S+/gi, "Authorization: [REDACTED]").slice(-4000).trim();
}
