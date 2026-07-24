import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.resolve(
  process.env.NIXHOST_E2E_DATA_DIR || path.join(process.cwd(), ".e2e-data"),
);
const basename = path.basename(dataDirectory);
if (!basename.startsWith(".e2e-data") && !basename.startsWith("nixhost-e2e")) {
  throw new Error(`Refusing to clear an unsafe end-to-end data path: ${dataDirectory}`);
}
fs.rmSync(dataDirectory, { recursive: true, force: true });

const child = spawn("pnpm", ["start"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: "3000",
    NIXHOST_DATA_DIR: dataDirectory,
    NIXHOST_MIN_FREE_DISK_MB: "128",
    NIXHOST_MIN_FREE_MEMORY_MB: "64",
  },
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
