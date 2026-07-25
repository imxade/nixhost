import type { NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth";
import {
  clearPendingCloudflareOAuthGrant,
  pendingCloudflareOAuthGrant,
} from "@/server/cloudflare-oauth";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  accountId: z.string().regex(/^[0-9a-f]{32}$/i),
  zoneId: z.string().regex(/^[0-9a-f]{32}$/i),
  tunnelName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
  dashboardHostname: z.string().trim().max(253).optional().default(""),
});

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const input = schema.parse(await readJson(request));
    const tokens = await pendingCloudflareOAuthGrant(user.id);
    const runtime = await getRuntime();
    await runtime.cloudflare.configureOAuth({ ...input, tokens });
    clearPendingCloudflareOAuthGrant(user.id);
    audit({
      userId: user.id,
      ip: clientIp(request),
      action: "cloudflare.oauth.connected",
      details: {
        accountId: input.accountId,
        zoneId: input.zoneId,
        tunnelName: input.tunnelName,
        dashboardHostname: input.dashboardHostname,
      },
    });
    return runtime.cloudflare.status(user.id);
  });
}
