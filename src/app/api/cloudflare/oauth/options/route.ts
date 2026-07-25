import type { NextRequest } from "next/server";
import { requireRole } from "@/server/auth";
import { cloudflareOAuthOptions } from "@/server/cloudflare-oauth";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    return cloudflareOAuthOptions(user.id);
  });
}
