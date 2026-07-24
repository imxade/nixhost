import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import { errorMessage } from "./errors.ts";

export interface CommandResult {
  code: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  executable: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    maxOutputBytes?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CommandResult> {
  const maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let terminating = false;
    let escalationTimer: NodeJS.Timeout | undefined;
    const detached = process.platform !== "win32";
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached,
    });

    const terminate = (signal: NodeJS.Signals): void => {
      if (!child.pid) return;
      try {
        process.kill(detached ? -child.pid : child.pid, signal);
      } catch {
        // The command may already have exited.
      }
    };

    const beginTermination = (): void => {
      if (terminating) return;
      terminating = true;
      terminate("SIGTERM");
      escalationTimer = setTimeout(() => terminate("SIGKILL"), 5000);
      escalationTimer.unref();
    };

    const timeoutTimer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          beginTermination();
        }, options.timeoutMs)
      : undefined;
    timeoutTimer?.unref();

    const abortHandler = (): void => {
      aborted = true;
      beginTermination();
    };
    if (options.signal?.aborted) abortHandler();
    else options.signal?.addEventListener("abort", abortHandler, { once: true });

    const cleanup = (): void => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (escalationTimer) clearTimeout(escalationTimer);
      options.signal?.removeEventListener("abort", abortHandler);
    };

    const append = (
      current: Buffer<ArrayBufferLike>,
      chunk: Buffer<ArrayBufferLike>,
    ): Buffer<ArrayBufferLike> => {
      const next = Buffer.concat([current, chunk]);
      return next.length > maxOutputBytes ? next.subarray(next.length - maxOutputBytes) : next;
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed to execute ${executable}: ${errorMessage(error)}`));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        reject(new Error(`Command timed out: ${executable}`));
        return;
      }
      if (aborted) {
        reject(new Error(`Command was cancelled: ${executable}`));
        return;
      }
      resolve({
        code: code ?? 1,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
      });
    });
  });
}

export function spawnLogged(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdoutPath: string;
    stderrPath: string;
    detached?: boolean;
  },
): ChildProcess {
  const stdoutFd = fs.openSync(options.stdoutPath, "a", 0o600);
  const stderrFd = fs.openSync(options.stderrPath, "a", 0o600);
  try {
    return spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32" && (options.detached ?? true),
      stdio: ["ignore", stdoutFd, stderrFd],
    });
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}
