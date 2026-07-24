import { getDb } from "../src/server/db.js";
import { paths } from "../src/server/paths.js";
const db=getDb();
const integrity=db.pragma("integrity_check") as Array<{integrity_check:string}>;
const migrations=db.prepare("SELECT name, applied_at FROM schema_migrations ORDER BY name").all();
console.log(JSON.stringify({database:paths.database,integrity,migrations},null,2));
process.exit(integrity.every((item)=>item.integrity_check==="ok")?0:1);
