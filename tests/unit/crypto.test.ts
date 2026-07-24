import { describe, expect, it } from "vitest";
import { hashPassword, sha256, verifyPassword } from "../../src/server/crypto.ts";

describe("credential primitives", () => {
  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
  it("creates stable digests", () => expect(sha256("nixhost")).toHaveLength(64));
});
