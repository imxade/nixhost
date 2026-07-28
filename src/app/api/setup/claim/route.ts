import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setupTokenIsValid } from "@/server/auth";
import { SETUP_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(/^[a-zA-Z0-9_-]+$/);

export function GET(request: NextRequest): NextResponse {
  const parsed = tokenSchema.safeParse(request.nextUrl.searchParams.get("token"));
  const valid = parsed.success && setupTokenIsValid(parsed.data);
  const response = new NextResponse(null, {
    status: 303,
    headers: { location: valid ? "/setup" : "/setup?invalid=1" },
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  if (valid) {
    response.cookies.set(SETUP_COOKIE, parsed.data, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        request.nextUrl.protocol === "https:" ||
        request.headers.get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: 30 * 60,
    });
  } else {
    response.cookies.set(SETUP_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  }
  return response;
}
