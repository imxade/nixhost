import type { NextRequest } from "next/server";
import { z } from "zod";
import { queueDeployment } from "@/server/app-service";
import { requireRole } from "@/server/auth";
import { events } from "@/server/events";
import { api, readJson } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ commitSha: z.string().regex(/^[0-9a-f]{7,64}$/i).optional().nullable() });

export async function POST(request: NextRequest, context: Context) {
  return api(request, async () => {
    const user = requestUser(request);
    requireRole(user, ["owner", "admin", "operator"]);
    const { id } = await context.params;
    const input = schema.parse(await readJson(request));
    const deployment = queueDeployment(id, {
      commitSha: input.commitSha,
      requestedRef: input.commitSha ?? undefined,
      trigger: "manual",
    });
    events.publish("deployment.queued", `app:${id}`, { deploymentId: deployment.id, trigger: "manual" });
    return deployment;
  });
}
