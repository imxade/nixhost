import net from "node:net";
import { getDb } from "./db.ts";

async function canListen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

export async function allocateInternalPort(): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const port = 20000 + Math.floor(Math.random() * 30000);
    if (await canListen(port)) return port;
  }
  throw new Error("Unable to allocate an internal application port");
}

export async function allocatePublicPort(): Promise<number> {
  const used = new Set(
    (
      getDb()
        .prepare("SELECT public_port FROM applications WHERE public_port IS NOT NULL")
        .all() as Array<{
        public_port: number;
      }>
    ).map((row) => row.public_port),
  );
  for (let port = 10000; port <= 19999; port++) {
    if (!used.has(port) && (await canListen(port, "0.0.0.0"))) return port;
  }
  throw new Error("No free LAN application ports are available in the configured range");
}
