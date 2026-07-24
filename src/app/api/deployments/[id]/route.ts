import type { NextRequest } from "next/server";
import { getDeployment } from "@/server/app-service";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return api(request, async () => {
    requestUser(request);
    const { id } = await context.params;
    return getDeployment(id);
  });
}
