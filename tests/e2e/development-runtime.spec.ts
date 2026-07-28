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
