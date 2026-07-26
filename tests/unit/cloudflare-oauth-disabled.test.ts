import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-oauth-disabled-test-"));
process.env.NIXHOST_DATA_DIR = dataDirectory;
process.env.NIXHOST_MASTER_KEY = Buffer.alloc(32, 22).toString("base64");
process.env.NIXHOST_CLOUDFLARE_OAUTH_ENABLED = "false";
process.env.NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID = "configured-but-disabled";
process.env.NIXHOST_CLOUDFLARE_OAUTH_REDIRECT_URI =
  "https://nixhost.example/api/cloudflare/oauth/callback";
process.env.NIXHOST_CLOUDFLARE_OAUTH_SCOPES = "account:cloudflare_tunnel:edit";

const [oauth, database] = await Promise.all([
  import("../../src/server/cloudflare-oauth.ts"),
  import("../../src/server/db.ts"),
]);

afterAll(() => {
  database.closeDb();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

describe("disabled Cloudflare OAuth boundary", () => {
  it("stays disconnected even when distributor credentials are present", async () => {
    expect(oauth.cloudflareOAuthStatus()).toEqual({ available: false, pending: false });
    await expect(oauth.createCloudflareAuthorization("owner-id")).rejects.toMatchObject({
      status: 503,
      code: "cloudflare_oauth_unavailable",
    });
  });
});
