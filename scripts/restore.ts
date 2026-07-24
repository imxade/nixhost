import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensureDataDirectories,paths } from "../src/server/paths.js";
const source=process.argv[2]?path.resolve(process.argv[2]):null;if(!source)throw new Error("Usage: pnpm restore -- /path/to/backup");
if(fs.existsSync(path.join(paths.runtime,"runtime.lock")))throw new Error("Stop NixHost before restoring a backup");
for(const name of ["nixhost.sqlite","applications.tar.gz","manifest.json"]){if(!fs.existsSync(path.join(source,name)))throw new Error(`Backup is missing ${name}`)}
ensureDataDirectories();
for(const suffix of ["","-wal","-shm"]){fs.rmSync(`${paths.database}${suffix}`,{force:true});}
fs.copyFileSync(path.join(source,"nixhost.sqlite"),paths.database);
if(fs.existsSync(path.join(source,"master.key")))fs.copyFileSync(path.join(source,"master.key"),paths.keyFile);
fs.rmSync(paths.appData,{recursive:true,force:true});
const tar=spawnSync("tar",["-C",paths.data,"-xzf",path.join(source,"applications.tar.gz")],{stdio:"inherit"});if(tar.status!==0)throw new Error("Unable to restore application data");
console.log(`Restored backup into ${paths.data}. Run pnpm db:doctor before starting NixHost.`);
