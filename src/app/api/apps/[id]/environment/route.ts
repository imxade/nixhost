import type { NextRequest } from "next/server";
import { z } from "zod";
import { environmentKeys, removeEnvironmentKey, setEnvironment } from "@/server/app-service";
import { requireRole } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const putSchema = z.object({ variables: z.record(z.string(), z.string()), secret: z.boolean().default(true) });
const deleteSchema = z.object({ key: z.string().min(1) });

export async function GET(request: NextRequest, context: Context) {
  return api(request, async () => {
    requestUser(request);
    const { id } = await context.params;
    return environmentKeys(id);
  });
}

export async function PUT(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin", "operator"]);
    const { id } = await context.params;
    const input = putSchema.parse(await readJson(request));
    setEnvironment(id, input.variables, input.secret, { id: user.id, ip: clientIp(request) });
    return environmentKeys(id);
  });
}

export async function DELETE(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin", "operator"]);
    const { id } = await context.params;
    const input = deleteSchema.parse(await readJson(request));
    removeEnvironmentKey(id, input.key);
    return environmentKeys(id);
  });
}
