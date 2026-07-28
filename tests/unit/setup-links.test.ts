import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { firstRunSetupUrl } from "../../src/server/setup-links.ts";

describe("first-run setup links", () => {
  it("places the one-time credential only in the claim URL", () => {
    expect(firstRunSetupUrl("http://192.168.1.15:3000", "one_time-token_1234")).toBe(
      "http://192.168.1.15:3000/api/setup/claim?token=one_time-token_1234",
    );
  });

  it("replaces any path or query from a Quick Tunnel origin", () => {
    expect(
      firstRunSetupUrl(
        "https://temporary.trycloudflare.com/ignored?value=1",
        "one_time-token_1234",
      ),
    ).toBe("https://temporary.trycloudflare.com/api/setup/claim?token=one_time-token_1234");
  });

  it("drives Android first-run setup through the complete claim URL", () => {
    const flow = fs.readFileSync(
      new URL("../../.maestro/flows/first-run-setup.yaml", import.meta.url),
      "utf8",
    );
    const runner = fs.readFileSync(
      new URL("../../scripts/android/run-maestro.sh", import.meta.url),
      "utf8",
    );
    const setupUrlPlaceholder = "$" + "{SETUP_URL}";
    expect(flow).toContain(`- openLink: ${setupUrlPlaceholder}`);
    expect(`${flow}\n${runner}`).not.toContain("SETUP_TOKEN");
    expect(flow).not.toContain('tapOn: "Setup token"');
  });
});
