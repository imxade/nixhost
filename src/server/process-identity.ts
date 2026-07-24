import crypto from "node:crypto";
import fs from "node:fs";

export interface ProcessIdentity {
  pid: number;
  processGroupId: number;
  startTicks: string | null;
  commandHash: string | null;
  commandSummary: string | null;
}

export interface StoredProcessIdentity {
  pid: number | null;
  process_group_id: number | null;
  process_start_ticks: string | null;
  process_command_hash?: string | null;
  process_command_summary?: string | null;
}

/**
 * Capture stable process metadata. Linux exposes a kernel start-time counter that
 * lets us distinguish a live process from a later process that reused the PID.
 */
export function captureProcessIdentity(pid: number): ProcessIdentity | null {
  if (!Number.isSafeInteger(pid) || pid <= 1) return null;
  if (process.platform !== "linux") {
    return isPidReachable(pid)
      ? {
          pid,
          processGroupId: pid,
          startTicks: null,
          commandHash: null,
          commandSummary: null,
        }
      : null;
  }

  try {
    const parsed = parseLinuxProcessStat(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
    const commandBytes = readCommandBytes(pid);
    return {
      pid,
      processGroupId: parsed.processGroupId,
      startTicks: parsed.startTicks,
      commandHash: commandBytes.length > 0 ? sha256(commandBytes) : null,
      commandSummary: commandBytes.length > 0 ? summarizeCommand(commandBytes) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Verify identity conservatively. On Linux, PID and process-group ID alone are
 * insufficient because PIDs are reused. On unsupported platforms a recovered
 * process is intentionally treated as unverifiable.
 */
export function matchesProcessIdentity(stored: StoredProcessIdentity): boolean {
  if (!stored.pid || !stored.process_group_id || stored.pid <= 1 || stored.process_group_id <= 1) {
    return false;
  }
  if (process.platform !== "linux") return false;
  if (!stored.process_start_ticks || !stored.process_command_hash) return false;

  const current = captureProcessIdentity(stored.pid);
  return Boolean(
    current &&
      current.processGroupId === stored.process_group_id &&
      current.startTicks === stored.process_start_ticks &&
      current.commandHash === stored.process_command_hash,
  );
}

export function isPidReachable(pid: number | null): boolean {
  if (!pid || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function parseLinuxProcessStat(value: string): {
  processGroupId: number;
  startTicks: string;
} {
  const closing = value.lastIndexOf(")");
  if (closing < 0) throw new Error("Invalid /proc process stat record");
  const fields = value
    .slice(closing + 2)
    .trim()
    .split(/\s+/);
  // fields[0] starts at the kernel's field 3 (state). pgrp is field 5 and
  // starttime is field 22, therefore indexes 2 and 19 in this sliced array.
  const processGroupId = Number(fields[2]);
  const startTicks = fields[19];
  if (
    !Number.isSafeInteger(processGroupId) ||
    processGroupId < 1 ||
    !startTicks ||
    !/^\d+$/.test(startTicks)
  ) {
    throw new Error("Incomplete /proc process identity");
  }
  return { processGroupId, startTicks };
}

function readCommandBytes(pid: number): Buffer {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`);
  } catch {
    try {
      return Buffer.from(fs.readlinkSync(`/proc/${pid}/exe`));
    } catch {
      return Buffer.alloc(0);
    }
  }
}

function summarizeCommand(value: Buffer): string {
  const sanitized = Array.from(value.toString("utf8"), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127 ? " " : character;
  }).join("");
  return sanitized.replace(/\s+/g, " ").trim().slice(0, 512);
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
