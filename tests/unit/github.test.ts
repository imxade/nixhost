import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-github-test-"));
process.env.NIXHOST_DATA_DIR = dataDirectory;
process.env.NIXHOST_MASTER_KEY = Buffer.alloc(32, 31).toString("base64");

const [{ createManifest }, database] = await Promise.all([
  import("../../src/server/github.ts"),
  import("../../src/server/db.ts"),
]);

afterAll(() => {
  delete process.env.NIXHOST_PUBLIC_URL;
  database.closeDb();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

describe("GitHub App manifest", () => {
  it("provides the required public hook URL but keeps it inactive for a LAN-only node", () => {
    delete process.env.NIXHOST_PUBLIC_URL;
    const { manifest } = createManifest("http://127.0.0.1:3000");

    expect(manifest.hook_attributes).toEqual({
      url: "https://example.com/",
      active: false,
    });
    expect(manifest.default_events).toEqual(["push"]);
    expect(manifest.setup_on_update).toBe(true);
  });

  it("activates the webhook only for the configured public origin", () => {
    process.env.NIXHOST_PUBLIC_URL = "https://console.example.com/";
    const { manifest } = createManifest("http://127.0.0.1:3000");

    expect(manifest.hook_attributes).toEqual({
      url: "https://console.example.com/api/github/webhook",
      active: true,
    });
  });
});
