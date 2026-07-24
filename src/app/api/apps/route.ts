import type { NextRequest } from "next/server";
import { createApplication, listApplications, applicationDomain } from "@/server/app-service";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";
import { requireRole } from "@/server/auth";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, () => {
    requestUser(request);
    return listApplications().map((app) => ({ ...app, domain: applicationDomain(app.id) }));
  });
}

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin", "operator"]);
    const app = await createApplication(await readJson(request), { id: user.id, ip: clientIp(request) });
    const runtimeInstance = await getRuntime();
    await runtimeInstance.proxy.reconcile();
    return app;
  });
}
