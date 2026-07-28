import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { completeSetup, createSession } from "@/server/auth";
import { api, isFormSubmission, readFormUrlEncoded, readJson } from "@/server/http";
import { clientIp, SESSION_COOKIE, SETUP_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(12),
});

export async function POST(request: NextRequest) {
  const formSubmission = isFormSubmission(request);
  const state: { session?: { token: string; expiresAt: string } } = {};
  const apiResponse = await api(request, async () => {
    const raw = formSubmission ? await readFormUrlEncoded(request) : await readJson(request);
    const input = schema.parse(raw);
    const token = request.cookies.get(SETUP_COOKIE)?.value ?? "";
    const user = await completeSetup({ ...input, token, ip: clientIp(request) });
    state.session = createSession(user.id, clientIp(request), request.headers.get("user-agent"));
    return { user };
  });
  const response = formSubmission
    ? new NextResponse(null, {
        status: 303,
        headers: { location: apiResponse.ok ? "/apps" : "/setup?error=setup_failed" },
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
    response.cookies.set(SETUP_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  }
  return response;
}
