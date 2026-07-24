import { createBackup } from "../src/server/backup.ts";

console.log(await createBackup(process.argv[2]));
