import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  captureProcessIdentity,
  matchesProcessIdentity,
  parseLinuxProcessStat,
} from "../../src/server/process-identity.ts";

describe("process identity", () => {
  it.runIf(process.platform === "linux")("parses the current Linux process stat", () => {
    const parsed = parseLinuxProcessStat(fs.readFileSync(`/proc/${process.pid}/stat`, "utf8"));
    expect(parsed.processGroupId).toBeGreaterThan(0);
    expect(parsed.startTicks).toMatch(/^\d+$/);
  });

  it.runIf(process.platform === "linux")(
    "matches the current process and rejects changed start time",
    () => {
      const identity = captureProcessIdentity(process.pid);
      expect(identity).not.toBeNull();
      if (!identity) throw new Error("Current process identity was unavailable");
      const safelyGrouped = identity.processGroupId > 1;
      expect(
        matchesProcessIdentity({
          pid: identity.pid,
          process_group_id: identity.processGroupId,
          process_start_ticks: identity.startTicks,
          process_command_hash: identity.commandHash,
        }),
      ).toBe(safelyGrouped);
      expect(
        matchesProcessIdentity({
          pid: identity.pid,
          process_group_id: identity.processGroupId,
          process_start_ticks: `${identity.startTicks}0`,
          process_command_hash: identity.commandHash,
        }),
      ).toBe(false);
      expect(
        matchesProcessIdentity({
          pid: identity.pid,
          process_group_id: identity.processGroupId,
          process_start_ticks: identity.startTicks,
          process_command_hash: "0".repeat(64),
        }),
      ).toBe(false);
    },
  );
});
