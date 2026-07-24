import fs from "node:fs";
import path from "node:path";
import { runCommand } from "./command.ts";
import { HttpError } from "./errors.ts";

let cachedSystem: string | undefined;

export async function currentNixSystem(): Promise<string> {
  if (cachedSystem) return cachedSystem;
  const result = await runCommand(
    "nix",
    ["eval", "--impure", "--raw", "--expr", "builtins.currentSystem"],
    {
      timeoutMs: 30_000,
    },
  );
  if (result.code !== 0)
    throw new Error(`Unable to determine Nix system: ${result.stderr || result.stdout}`);
  cachedSystem = result.stdout.trim();
  return cachedSystem;
}

export async function inspectFlake(
  releaseDir: string,
  output: string,
  signal?: AbortSignal,
): Promise<{
  system: string;
  outputs: string[];
}> {
  if (!fs.existsSync(path.join(releaseDir, "flake.nix"))) {
    throw new HttpError(400, "Repository does not contain flake.nix", "flake_missing");
  }
  if (!fs.existsSync(path.join(releaseDir, "flake.lock"))) {
    throw new HttpError(400, "Repository does not contain flake.lock", "flake_lock_missing");
  }
  const system = await currentNixSystem();
  const show = await runCommand(
    "nix",
    ["flake", "show", "--json", "--no-write-lock-file", releaseDir],
    {
      timeoutMs: 10 * 60_000,
      maxOutputBytes: 16 * 1024 * 1024,
      signal,
    },
  );
  if (show.code !== 0) {
    throw new HttpError(
      400,
      `Flake evaluation failed: ${tail(show.stderr || show.stdout)}`,
      "flake_evaluation_failed",
    );
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(show.stdout) as Record<string, unknown>;
  } catch {
    throw new Error("nix flake show returned invalid JSON");
  }
  const apps = ((parsed.apps as Record<string, unknown> | undefined)?.[system] ?? {}) as Record<
    string,
    unknown
  >;
  const packages = ((parsed.packages as Record<string, unknown> | undefined)?.[system] ??
    {}) as Record<string, unknown>;
  const outputs = [...new Set([...Object.keys(apps), ...Object.keys(packages)])].sort();
  if (!(output in apps) && !(output in packages)) {
    throw new HttpError(
      400,
      outputs.length
        ? `Flake output '${output}' is unavailable for ${system}. Available: ${outputs.join(", ")}`
        : `Flake provides no runnable apps or packages for ${system}`,
      "flake_output_missing",
    );
  }
  return { system, outputs };
}

function tail(value: string, max = 4000): string {
  return value.length <= max ? value.trim() : value.slice(-max).trim();
}
