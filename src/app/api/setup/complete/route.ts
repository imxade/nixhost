import type { NextRequest } from "next/server";
import { z } from "zod";
import { completeSetup, createSession } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, SESSION_COOKIE, SETUP_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(12),
});

export async function POST(request: NextRequest) {
  const state: { session?: { token: string; expiresAt: string } } = {};
  const response = await api(request, async () => {
    const input = schema.parse(await readJson(request));
    const token = request.cookies.get(SETUP_COOKIE)?.value ?? "";
    const user = await completeSetup({ ...input, token, ip: clientIp(request) });
    state.session = createSession(user.id, clientIp(request), request.headers.get("user-agent"));
    return { user };
  });
  if (state.session && response.ok) {
    response.cookies.set(SESSION_COOKIE, state.session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        request.nextUrl.protocol === "https:" ||
        request.headers.get("x-forwarded-proto") === "https",
      path: "/",
      expires: new Date(state.session.expiresAt),
    });
    response.cookies.set(SETUP_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  }
  return response;
}
