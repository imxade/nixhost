import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { logger } from "./logger.js";
import { paths } from "./paths.js";

interface LogFile { file: string; size: number; mtimeMs: number; deploymentId: string | null }

export class LogRetentionController {
  private timer: NodeJS.Timeout | null = null;
  boot(): void { this.timer=setInterval(()=>this.prune(),60*60_000);this.timer.unref();setTimeout(()=>this.prune(),30_000).unref(); }
  close(): void { if(this.timer)clearInterval(this.timer);this.timer=null; }
  prune(): void {
    try {
      const running=new Set((getDb().prepare("SELECT id FROM deployments WHERE state = 'running'").all() as Array<{id:string}>).map(row=>row.id));
      const files=walk(paths.logs).filter(item=>!item.deploymentId||!running.has(item.deploymentId));
      const cutoff=Date.now()-config.NIXHOST_LOG_RETENTION_DAYS*86400_000;
      let removed=0;
      for(const item of files){if(item.mtimeMs<cutoff){fs.rmSync(item.file,{force:true});item.size=0;removed++;}}
      let total=walk(paths.logs).reduce((sum,item)=>sum+item.size,0);
      const limit=config.NIXHOST_LOG_MAX_MB*1024*1024;
      for(const item of files.filter(item=>item.size>0).sort((a,b)=>a.mtimeMs-b.mtimeMs)){
        if(total<=limit)break;fs.rmSync(item.file,{force:true});total-=item.size;removed++;
      }
      if(removed)logger.info("Pruned retained logs",{removed,totalBytes:total});
    } catch(error){logger.warn("Log retention failed",{error:error instanceof Error?error.message:String(error)});}
  }
}

function walk(root:string):LogFile[]{if(!fs.existsSync(root))return[];const output:LogFile[]=[];for(const entry of fs.readdirSync(root,{withFileTypes:true})){const target=path.join(root,entry.name);if(entry.isDirectory())output.push(...walk(target));else if(entry.isFile()){const stat=fs.statSync(target);const match=entry.name.match(/^([0-9a-f-]{36})\./i);output.push({file:target,size:stat.size,mtimeMs:stat.mtimeMs,deploymentId:match?.[1]??null});}}return output;}
