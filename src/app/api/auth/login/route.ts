import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/server/auth";
import { api, isFormSubmission, readFormUrlEncoded, readJson } from "@/server/http";
import { clientIp, SESSION_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export async function POST(request: NextRequest) {
  const formSubmission = isFormSubmission(request);
  const state: { session?: { token: string; expiresAt: string } } = {};
  const apiResponse = await api(request, async () => {
    const raw = formSubmission ? await readFormUrlEncoded(request) : await readJson(request);
    const input = schema.parse(raw);
    const result = await login({
      ...input,
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    state.session = { token: result.token, expiresAt: result.expiresAt };
    return { user: result.user };
  });
  const response = formSubmission
    ? new NextResponse(null, {
        status: 303,
        headers: { location: apiResponse.ok ? "/apps" : "/login?error=invalid_credentials" },
      })
    : apiResponse;
  if (state.session && apiResponse.ok) {
    response.cookies.set(SESSION_COOKIE, state.session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        request.nextUrl.protocol === "https:" ||
        request.headers.get("x-forwarded-proto") === "https",
      path: "/",
      expires: new Date(state.session.expiresAt),
    });
  }
  return response;
}
