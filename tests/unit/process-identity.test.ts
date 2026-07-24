import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  captureProcessIdentity,
  matchesProcessIdentity,
  parseLinuxProcessStat,
} from "../../src/server/process-identity.js";

describe("process identity", () => {
  it.runIf(process.platform === "linux")("parses the current Linux process stat", () => {
    const parsed = parseLinuxProcessStat(fs.readFileSync(`/proc/${process.pid}/stat`, "utf8"));
    expect(parsed.processGroupId).toBeGreaterThan(1);
    expect(parsed.startTicks).toMatch(/^\d+$/);
  });

  it.runIf(process.platform === "linux")("matches the current process and rejects changed start time", () => {
    const identity = captureProcessIdentity(process.pid);
    expect(identity).not.toBeNull();
    expect(
      matchesProcessIdentity({
        pid: identity!.pid,
        process_group_id: identity!.processGroupId,
        process_start_ticks: identity!.startTicks,
      }),
    ).toBe(true);
    expect(
      matchesProcessIdentity({
        pid: identity!.pid,
        process_group_id: identity!.processGroupId,
        process_start_ticks: `${identity!.startTicks}0`,
      }),
    ).toBe(false);
  });
});
