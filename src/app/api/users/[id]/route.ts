import type { NextRequest } from "next/server";
import { requireRole } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";
import { updateUser } from "@/server/user-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const { id } = await context.params;
    return updateUser(id, await readJson(request), { id: user.id, ip: clientIp(request) });
  });
}
