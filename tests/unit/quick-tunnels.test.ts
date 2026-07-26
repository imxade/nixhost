import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseQuickTunnelUrl } from "../../src/server/quick-tunnel-url.ts";
import {
  cloudflaredStartError,
  quickTunnelArguments,
  spawnedProcessId,
} from "../../src/server/quick-tunnels.ts";

describe("Quick Tunnel URL discovery", () => {
  it("extracts the Cloudflare URL from structured or plain logs", () => {
    expect(
      parseQuickTunnelUrl(
        '{"level":"info","message":"https://Kind-Tree.trycloudflare.com is ready"}',
      ),
    ).toBe("https://kind-tree.trycloudflare.com");
  });

  it("rejects non-Quick-Tunnel hosts and deceptive suffixes", () => {
    expect(parseQuickTunnelUrl("https://example.com")).toBeNull();
    expect(parseQuickTunnelUrl("https://demo.trycloudflare.com.evil.example")).toBeNull();
  });

  it("uses supported cloudflared flags without changing the process home", () => {
    expect(quickTunnelArguments(4100)).toEqual([
      "tunnel",
      "--config",
      "/dev/null",
      "--no-autoupdate",
      "--loglevel",
      "info",
      "--output",
      "json",
      "--url",
      "http://127.0.0.1:4100",
    ]);
  });

  it("preserves spawn errors instead of reporting a missing PID", async () => {
    const child = spawn(`missing-cloudflared-${process.pid}`, [], { stdio: "ignore" });
    await expect(spawnedProcessId(child)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("names the missing cloudflared dependency", () => {
    expect(
      cloudflaredStartError(
        Object.assign(new Error("spawn cloudflared ENOENT"), { code: "ENOENT" }),
      ),
    ).toBe(
      "Missing dependency: cloudflared. Install cloudflared or set NIXHOST_CLOUDFLARED_BIN to its absolute path.",
    );
  });
});
