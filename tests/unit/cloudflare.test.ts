import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nixhost-cloudflare-test-"));
process.env.NIXHOST_DATA_DIR = dataDirectory;
process.env.NIXHOST_MASTER_KEY = Buffer.alloc(32, 29).toString("base64");

const [{ CloudflareController }, database, { encryptSecret }] = await Promise.all([
  import("../../src/server/cloudflare.ts"),
  import("../../src/server/db.ts"),
  import("../../src/server/crypto.ts"),
]);

const apiCalls: Array<{ url: string; init?: RequestInit }> = [];
const cloudflareFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  apiCalls.push({ url, init });
  const parsed = new URL(url);
  let result: unknown = {};
  if (parsed.pathname === "/client/v4/user/tokens/verify") {
    result = { id: "token-id", status: "active" };
  } else if (parsed.pathname === "/client/v4/zones/zone-primary") {
    result = { id: "zone-primary", name: "example.com", account: { id: "account" } };
  } else if (parsed.pathname === "/client/v4/accounts/account/cfd_tunnel" && parsed.search) {
    result = [];
  } else if (parsed.pathname.endsWith("/dns_records") && parsed.search) {
    const hostname = parsed.searchParams.get("name");
    if (hostname === "foreign.example.com") {
      result = [{ id: "foreign-record", content: "tunnel-id.cfargotunnel.com", comment: null }];
    } else if (hostname === "changed.example.com") {
      result = [
        { id: "changed-record", content: "other.example.net", comment: "Managed by NixHost" },
      ];
    } else if (hostname?.endsWith(".example.com")) {
      result = [
        {
          id: "dns-record",
          content: "tunnel-id.cfargotunnel.com",
          comment: "Managed by NixHost",
        },
      ];
    } else {
      result = [];
    }
  } else if (parsed.pathname === "/client/v4/zones") {
    result = [];
  }
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
vi.stubGlobal("fetch", cloudflareFetch);

const now = "2026-07-24T12:00:00.000Z";
const db = database.getDb();
db.prepare(
  `INSERT INTO applications(
    id, name, slug, kind, repository_url, branch, flake_output, public_port,
    created_at, updated_at
  ) VALUES ('app-1', 'Example API', 'example-api', 'web',
    'https://github.com/example/api.git', 'main', 'default', 10042, ?, ?)`,
).run(now, now);
db.prepare(
  "INSERT INTO application_domains(hostname, app_id, created_at, updated_at) VALUES (?, 'app-1', ?, ?)",
).run("api.example.com", now, now);
db.prepare(
  "INSERT INTO application_domains(hostname, app_id, created_at, updated_at) VALUES (?, 'app-1', ?, ?)",
).run("api.external.net", now, now);
db.prepare(
  `INSERT INTO cloudflare_config(
    singleton, account_id, zone_id, api_token_encrypted, tunnel_id, tunnel_name,
    tunnel_token_encrypted, enabled, created_at, updated_at
  ) VALUES (1, 'account', 'zone-primary', ?, 'tunnel-id', 'nixhost', ?, 1, ?, ?)`,
).run(encryptSecret("cloudflare-test-token"), encryptSecret("tunnel-test-token"), now, now);

afterAll(() => {
  vi.unstubAllGlobals();
  database.closeDb();
  fs.rmSync(dataDirectory, { recursive: true, force: true });
});

describe("Cloudflare application routes", () => {
  it("verifies token, zone ownership, and tunnel access before saving", async () => {
    const controller = new CloudflareController();
    await controller.configure({
      accountId: "account",
      zoneId: "zone-primary",
      apiToken: "replacement-test-token",
      tunnelName: "nixhost",
    });

    expect(apiCalls.some((call) => call.url.endsWith("/user/tokens/verify"))).toBe(true);
    expect(
      apiCalls.some((call) =>
        call.url.endsWith("/accounts/account/cfd_tunnel?per_page=1&is_deleted=false"),
      ),
    ).toBe(true);
  });

  it("rejects a zone from another account before replacing stored configuration", async () => {
    const controller = new CloudflareController();

    await expect(
      controller.configure({
        accountId: "other-account",
        zoneId: "zone-primary",
        apiToken: "replacement-test-token",
        tunnelName: "nixhost",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "cloudflare_zone_account_mismatch",
    });
    expect(
      db.prepare("SELECT account_id FROM cloudflare_config WHERE singleton = 1").get(),
    ).toEqual({ account_id: "account" });
  });

  it("reports managed and external domains and removes stale managed DNS", async () => {
    const controller = new CloudflareController();
    await controller.syncIngress();

    expect(controller.status().routes).toMatchObject([
      {
        appId: "app-1",
        appName: "Example API",
        hostname: "api.example.com",
        publicPort: 10042,
        status: "managed",
        zoneId: "zone-primary",
      },
      {
        appId: "app-1",
        appName: "Example API",
        hostname: "api.external.net",
        publicPort: 10042,
        status: "external",
        zoneId: null,
      },
    ]);

    const configurationCall = apiCalls.find((call) =>
      call.url.endsWith("/cfd_tunnel/tunnel-id/configurations"),
    );
    const configuration = JSON.parse(String(configurationCall?.init?.body)) as {
      config: { ingress: Array<{ hostname?: string; service: string }> };
    };
    expect(configuration.config.ingress).toEqual([
      { hostname: "api.example.com", service: "http://127.0.0.1:10042" },
      { service: "http_status:404" },
    ]);

    db.prepare("DELETE FROM application_domains").run();
    const insertStatus = db.prepare(
      `INSERT INTO cloudflare_domain_status(
        hostname, app_id, status, zone_id, last_synced_at
      ) VALUES (?, 'app-1', 'managed', 'zone-primary', ?)`,
    );
    insertStatus.run("foreign.example.com", now);
    insertStatus.run("changed.example.com", now);
    await controller.syncIngress();

    expect(controller.status().routes).toEqual([]);
    expect(db.prepare("SELECT * FROM cloudflare_domain_status").all()).toEqual([]);
    expect(
      apiCalls.some(
        (call) =>
          call.init?.method === "DELETE" &&
          call.url.endsWith("/zones/zone-primary/dns_records/dns-record"),
      ),
    ).toBe(true);
    expect(
      apiCalls.some(
        (call) =>
          call.init?.method === "DELETE" &&
          (call.url.endsWith("/dns_records/foreign-record") ||
            call.url.endsWith("/dns_records/changed-record")),
      ),
    ).toBe(false);
  });
});
