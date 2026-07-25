import fs from "node:fs";

const NO_FOLLOW = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

export function deploymentLogSize(file: string): number {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | NO_FOLLOW);
    const stat = fs.fstatSync(fd);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

export function readDeploymentLogRange(
  file: string,
  offset: number,
  maxBytes: number,
): { text: string; nextOffset: number; size: number } {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | NO_FOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return { text: "", nextOffset: 0, size: 0 };
    const start = Math.max(0, Math.min(offset, stat.size));
    const length = Math.max(0, Math.min(maxBytes, stat.size - start));
    if (length === 0) return { text: "", nextOffset: start, size: stat.size };
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, start);
    return {
      text: buffer.subarray(0, read).toString("utf8"),
      nextOffset: start + read,
      size: stat.size,
    };
  } catch {
    return { text: "", nextOffset: 0, size: 0 };
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
}

export function readDeploymentLogTail(file: string, maxBytes: number): string {
  const size = deploymentLogSize(file);
  return readDeploymentLogRange(file, Math.max(0, size - maxBytes), maxBytes).text;
}
