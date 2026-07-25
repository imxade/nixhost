import { describe, expect, it } from "vitest";
import { shouldQueueReconciledHead } from "../../src/server/git-reconciler.ts";

describe("Git reconciliation", () => {
  it("queues a remote commit only when it has not been deployed before", () => {
    expect(shouldQueueReconciledHead("new-sha", "old-sha", false)).toBe(true);
    expect(shouldQueueReconciledHead("active-sha", "active-sha", false)).toBe(false);
    expect(shouldQueueReconciledHead("failed-sha", "old-sha", true)).toBe(false);
    expect(shouldQueueReconciledHead("initial-sha", null, true)).toBe(false);
  });
});
