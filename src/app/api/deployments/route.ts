import type { NextRequest } from "next/server";
import { listDeployments } from "@/server/app-service";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, () => {
    requestUser(request);
    const appId = request.nextUrl.searchParams.get("appId") ?? undefined;
    const limit = Math.min(
      200,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50)),
    );
    return listDeployments(appId, limit);
  });
}
