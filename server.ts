import http from "node:http";
import next from "next";
import { config } from "./src/server/config.js";
import { bootRuntime } from "./src/server/runtime.js";
import { logger } from "./src/server/logger.js";

const development = process.env.NODE_ENV !== "production";
const app = next({ dev: development, hostname: config.HOSTNAME, port: config.PORT });
const handle = app.getRequestHandler();

await bootRuntime();
await app.prepare();

const server = http.createServer((request, response) => {
  sanitizeForwardedHeaders(request);
  void handle(request, response).catch((error: unknown) => {
    logger.error("Unhandled Next.js request error", {
      error: error instanceof Error ? error.message : String(error),
      url: request.url,
    });
    if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Internal server error\n");
  });
});

server.requestTimeout = 120_000;
server.headersTimeout = 65_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 100;

server.listen(config.PORT, config.HOSTNAME, () => {
  logger.info("NixHost dashboard listening", {
    address: `http://${config.HOSTNAME}:${config.PORT}`,
    environment: process.env.NODE_ENV,
  });
});

function sanitizeForwardedHeaders(request: http.IncomingMessage): void {
  const remoteAddress = request.socket.remoteAddress ?? "unknown";
  const loopback =
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1";
  if (!loopback) {
    delete request.headers["cf-connecting-ip"];
    delete request.headers["x-forwarded-for"];
    delete request.headers["x-forwarded-host"];
    delete request.headers["x-forwarded-proto"];
  }
  request.headers["x-nixhost-client-ip"] = remoteAddress;
}

let shuttingDown = false;
async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("Shutting down NixHost control plane", { signal, exitCode });

  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out", { signal });
    server.closeAllConnections();
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  const serverClosed = new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });

  try {
    const runtime = await bootRuntime();
    await runtime.close();
  } catch (error) {
    exitCode = 1;
    logger.error("Runtime shutdown failed", {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
  } finally {
    server.closeAllConnections();
    await serverClosed;
    clearTimeout(forceExit);
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: error.stack ?? error.message });
  void shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason: reason instanceof Error ? reason.stack : String(reason) });
  void shutdown("unhandledRejection", 1);
});
