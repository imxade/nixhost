import type { NextRequest } from "next/server";
import { listRepositories, syncInstallations } from "@/server/github";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, async () => {
    requestUser(request);
    try {
      await syncInstallations();
    } catch {
      // Existing installation rows may still be usable when GitHub is briefly unavailable.
    }
    return listRepositories();
  });
}
