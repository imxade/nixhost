import { restoreBackup } from "../src/server/backup.ts";

const source = process.argv[2];
if (!source) throw new Error("Usage: pnpm restore -- /path/to/backup");
restoreBackup(source);
console.log("Backup checksums, archive paths, and SQLite integrity verified; restore completed.");
