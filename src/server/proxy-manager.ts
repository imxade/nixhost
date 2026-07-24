import http, { type IncomingHttpHeaders, type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from "node:http";
import net from "node:net";
import type { Socket } from "node:net";
import { getDb } from "./db.js";
import { logger } from "./logger.js";
import type { AppRow } from "./types.js";

interface Listener {
  port: number;
  server: http.Server;
  sockets: Set<Socket>;
}

export class ProxyManager {
  private readonly listeners = new Map<string, Listener>();

  async reconcile(): Promise<void> {
    const apps = getDb()
      .prepare("SELECT * FROM applications WHERE kind = 'web' AND public_port IS NOT NULL")
      .all() as AppRow[];
    const expected = new Set(apps.map((app) => app.id));
    for (const app of apps) {
      const existing = this.listeners.get(app.id);
      if (existing?.port === app.public_port) continue;
      if (existing) await this.closeListener(app.id);
      if (app.public_port) await this.openListener(app.id, app.public_port);
    }
    for (const appId of this.listeners.keys()) {
      if (!expected.has(appId)) await this.closeListener(appId);
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.listeners.keys()].map((appId) => this.closeListener(appId)));
  }

  private async openListener(appId: string, port: number): Promise<void> {
    const sockets = new Set<Socket>();
    const server = http.createServer((request, response) =>
      this.proxyHttp(appId, request, response),
    );
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (request, socket, head) =>
      this.proxyUpgrade(appId, request, socket, head),
    );
    server.requestTimeout = 0;
    server.headersTimeout = 65_000;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.listeners.set(appId, { port, server, sockets });
    logger.info("Application LAN proxy listening", { appId, port });
  }

  private async closeListener(appId: string): Promise<void> {
    const listener = this.listeners.get(appId);
    if (!listener) return;
    this.listeners.delete(appId);
    for (const socket of listener.sockets) socket.destroy();
    await new Promise<void>((resolve) => listener.server.close(() => resolve()));
  }

  private targetPort(appId: string): number | null {
    const row = getDb()
      .prepare("SELECT active_internal_port, desired_state FROM applications WHERE id = ?")
      .get(appId) as { active_internal_port: number | null; desired_state: string } | undefined;
    return row?.desired_state === "running" ? row.active_internal_port : null;
  }

  private proxyHttp(appId: string, request: IncomingMessage, response: ServerResponse): void {
    const port = this.targetPort(appId);
    if (!port) {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8", "retry-after": "5" });
      response.end("Application unavailable\n");
      return;
    }

    const headers = stripHopByHopHeaders(request.headers);
    const remoteAddress = request.socket.remoteAddress ?? "";
    const existingForwardedFor = firstHeader(request.headers["x-forwarded-for"]);
    headers.host = request.headers.host;
    headers["x-forwarded-for"] = existingForwardedFor ? `${existingForwardedFor}, ${remoteAddress}` : remoteAddress;
    headers["x-forwarded-host"] = firstHeader(request.headers.host) ?? "";
    headers["x-forwarded-proto"] = isEncryptedSocket(request.socket) ? "https" : "http";

    const upstream = http.request(
      {
        host: "127.0.0.1",
        port,
        method: request.method,
        path: request.url,
        headers,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, stripHopByHopHeaders(upstreamResponse.headers));
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end("Upstream application connection failed\n");
    });
    request.on("aborted", () => upstream.destroy());
    response.on("close", () => {
      if (!response.writableEnded) upstream.destroy();
    });
    request.pipe(upstream);
  }

  private proxyUpgrade(appId: string, request: IncomingMessage, socket: Socket, head: Buffer): void {
    const port = this.targetPort(appId);
    if (!port) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      return;
    }
    const upstream = net.connect(port, "127.0.0.1", () => {
      const headerLines = [`${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${request.httpVersion}`];
      const denied = new Set([
        "proxy-authorization",
        "proxy-authenticate",
        "proxy-connection",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
      ]);
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index] ?? "";
        const value = request.rawHeaders[index + 1] ?? "";
        if (!name || denied.has(name.toLowerCase())) continue;
        headerLines.push(`${name}: ${value}`);
      }
      headerLines.push(`X-Forwarded-For: ${request.socket.remoteAddress ?? ""}`);
      headerLines.push(`X-Forwarded-Host: ${request.headers.host ?? ""}`);
      headerLines.push(
        `X-Forwarded-Proto: ${isEncryptedSocket(request.socket) ? "https" : "http"}`,
      );
      upstream.write(`${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
  }
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function stripHopByHopHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const denied = new Set(HOP_BY_HOP_HEADERS);
  const connection = firstHeader(headers.connection);
  for (const token of connection?.split(",") ?? []) {
    const normalized = token.trim().toLowerCase();
    if (normalized) denied.add(normalized);
  }

  const result: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || denied.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  return result;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isEncryptedSocket(socket: Socket): boolean {
  return Boolean((socket as Socket & { encrypted?: boolean }).encrypted);
}
