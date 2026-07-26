import type { NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { requireRole } from "@/server/auth";
import { createCloudflareAuthorization } from "@/server/cloudflare-oauth";
import { api } from "@/server/http";
import { clientIp, requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const authorizationUrl = await createCloudflareAuthorization(user.id);
    audit({
      userId: user.id,
      ip: clientIp(request),
      action: "cloudflare.oauth.started",
    });
    return { authorizationUrl };
  });
}
