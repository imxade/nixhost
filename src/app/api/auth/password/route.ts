import type { NextRequest } from "next/server";
import { z } from "zod";
import { changeOwnPassword } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, requestUser, SESSION_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});

export async function POST(request: NextRequest) {
  return api(request, async () => {
    const user = requestUser(request);
    const currentSessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (!currentSessionToken) throw new Error("Authenticated session cookie is missing");
    const input = schema.parse(await readJson(request));
    await changeOwnPassword({
      ...input,
      userId: user.id,
      currentSessionToken,
      ip: clientIp(request),
    });
    return {};
  });
}
