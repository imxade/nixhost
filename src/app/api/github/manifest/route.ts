import type { NextRequest } from "next/server";
import { requireRole } from "@/server/auth";
import { createManifest } from "@/server/github";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const protocol =
      request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    const baseUrl = `${protocol}://${request.headers.get("x-forwarded-host") ?? request.headers.get("host")}`;
    const result = createManifest(baseUrl);
    return {
      action: `https://github.com/settings/apps/new?state=${encodeURIComponent(result.state)}`,
      manifest: JSON.stringify(result.manifest),
    };
  });
}
