import fs from "node:fs";
import { paths,ensureDataDirectories } from "../src/server/paths.js";
ensureDataDirectories();
const checks=[paths.data,paths.secrets,paths.runtime].map((target)=>({target,mode:(fs.statSync(target).mode&0o777).toString(8)}));
let failed=false;
for(const check of checks){if((Number.parseInt(check.mode,8)&0o077)!==0)failed=true;}
console.log(JSON.stringify({checks,secure:!failed},null,2));
process.exit(failed?1:0);
