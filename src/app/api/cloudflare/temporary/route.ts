import type { NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const input = schema.parse(await readJson(request));
    const runtime = await getRuntime();
    if (input.enabled) await runtime.cloudflare.enableTemporaryTunnel();
    else await runtime.cloudflare.disableTemporaryTunnel();
    audit({
      userId: user.id,
      ip: clientIp(request),
      action: input.enabled ? "cloudflare.temporary.enabled" : "cloudflare.temporary.disabled",
    });
    return runtime.cloudflare.status(user.id);
  });
}
