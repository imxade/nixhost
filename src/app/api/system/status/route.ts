import os from "node:os";
import type { NextRequest } from "next/server";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";
import { latestHostMetric } from "@/server/metrics";
import { getRuntime } from "@/server/runtime";
import { currentNixSystem } from "@/server/flake";
import { getGitHubApp } from "@/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, async () => {
    requestUser(request);
    const runtimeInstance = await getRuntime();
    let nixSystem: string | null = null;
    try {
      nixSystem = await currentNixSystem();
    } catch {}
    return {
      host: {
        hostname: os.hostname(),
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        nixSystem,
        pid: process.pid,
      },
      metric: latestHostMetric(),
      github: { connected: Boolean(getGitHubApp()) },
      cloudflare: runtimeInstance.cloudflare.status(),
    };
  });
}
