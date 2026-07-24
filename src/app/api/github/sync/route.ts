import type { NextRequest } from "next/server";
import { requireRole } from "@/server/auth";
import { syncInstallations } from "@/server/github";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin"]);
    const count = await syncInstallations();
    return { count };
  });
}
