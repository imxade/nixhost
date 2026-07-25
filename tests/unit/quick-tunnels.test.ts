import { describe, expect, it } from "vitest";
import { parseQuickTunnelUrl } from "../../src/server/quick-tunnel-url.ts";

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
});
