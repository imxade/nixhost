import type { NextRequest } from "next/server";
import {
  applicationDomains,
  deleteApplication,
  environmentKeys,
  getApplication,
  listDeployments,
  updateApplication,
} from "@/server/app-service";
import { requireRole } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { latestAppMetric } from "@/server/metrics";
import { clientIp, requestUser } from "@/server/next-auth";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return api(request, async () => {
    requestUser(request);
    const { id } = await context.params;
    const runtimeInstance = await getRuntime();
    const cloudflare = runtimeInstance.cloudflare.status();
    return {
      app: getApplication(id),
      domains: applicationDomains(id),
      cloudflare: {
        configured: cloudflare.configured,
        enabled: cloudflare.enabled,
        running: cloudflare.running,
        routes: cloudflare.routes.filter((route) => route.appId === id),
      },
      environment: environmentKeys(id),
      deployments: listDeployments(id, 30),
      metric: latestAppMetric(id),
    };
  });
}

export async function PATCH(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin", "operator"]);
    const { id } = await context.params;
    const app = updateApplication(id, await readJson(request), {
      id: user.id,
      ip: clientIp(request),
    });
    const runtimeInstance = await getRuntime();
    await runtimeInstance.proxy.reconcile();
    await runtimeInstance.cloudflare.syncIngress();
    return app;
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const { id } = await context.params;
    const runtimeInstance = await getRuntime();
    await runtimeInstance.stopApplication(id);
    deleteApplication(id);
    await runtimeInstance.proxy.reconcile();
    await runtimeInstance.cloudflare.syncIngress();
    return {};
  });
}
