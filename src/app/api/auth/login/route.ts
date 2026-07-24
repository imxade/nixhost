import { type NextRequest } from "next/server";
import { z } from "zod";
import { login } from "@/server/auth";
import { api, readJson } from "@/server/http";
import { clientIp, SESSION_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(request: NextRequest) {
  const state: { session?: { token: string; expiresAt: string } } = {};
  const response = await api(request, async () => {
    const input = schema.parse(await readJson(request));
    const result = await login({
      ...input,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    state.session = { token: result.token, expiresAt: result.expiresAt };
    return { user: result.user };
  });
  if (state.session && response.ok) {
    response.cookies.set(SESSION_COOKIE, state.session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
      path: "/",
      expires: new Date(state.session.expiresAt),
    });
  }
  return response;
}
