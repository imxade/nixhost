import path from "node:path";
import type { NextRequest } from "next/server";
import { getDeployment } from "@/server/app-service";
import { readDeploymentLogTail } from "@/server/deployment-logs";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";
import { appPaths } from "@/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return api(request, async () => {
    requestUser(request);
    const { id } = await context.params;
    const deployment = getDeployment(id);
    const logs = appPaths(deployment.app_id).logs;
    const revision = deployment.commit_sha || deployment.requested_ref;
    const header = [
      `[deployment] ${deployment.state} · ${deployment.trigger} · ${revision.slice(0, 12)}`,
      deployment.failure_message ? `[error] ${deployment.failure_message}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const stdout = readDeploymentLogTail(path.join(logs, `${id}.stdout.log`), 128 * 1024);
    const stderr = readDeploymentLogTail(path.join(logs, `${id}.stderr.log`), 128 * 1024);
    return {
      state: deployment.state,
      text: [header, stdout ? `\n[stdout]\n${stdout}` : "", stderr ? `\n[stderr]\n${stderr}` : ""]
        .filter(Boolean)
        .join("\n")
        .slice(-300_000),
    };
  });
}
