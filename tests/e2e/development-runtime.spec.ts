import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type WebSocket } from "@playwright/test";

test("custom development server completes the Next.js HMR WebSocket upgrade", async ({ page }) => {
  let hmrSocket: WebSocket | undefined;
  let socketError: string | undefined;
  let resolveFrame: (() => void) | undefined;
  const receivedFrame = new Promise<void>((resolve) => {
    resolveFrame = resolve;
  });

  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/_next/webpack-hmr")) return;
    hmrSocket = socket;
    socket.on("framereceived", () => resolveFrame?.());
    socket.on("socketerror", (error) => {
      socketError = error;
      resolveFrame?.();
    });
  });

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Claim this NixHost" })).toBeVisible();
  await expect.poll(() => hmrSocket?.url()).toContain("/_next/webpack-hmr");
  await Promise.race([
    receivedFrame,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("HMR WebSocket received no frames")), 10_000),
    ),
  ]);
  expect(socketError).toBeUndefined();
});

test("a Next.js startup failure occurs before the persistent runtime starts", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-startup-collision-"));
  const dataDirectory = path.join(temporaryRoot, "data");
  try {
    const result = spawnSync("pnpm", ["dev"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        HOSTNAME: "127.0.0.1",
        PORT: "39999",
        NIXHOST_DATA_DIR: dataDirectory,
        NIXHOST_QUICK_TUNNELS_ENABLED: "false",
      },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Another next dev server is already running",
    );
    expect(fs.existsSync(dataDirectory)).toBe(false);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
