import { NextResponse, type NextRequest } from "next/server";
import { logout } from "@/server/auth";
import { api } from "@/server/http";
import { clientIp, SESSION_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await api(request, () => {
    logout(request.cookies.get(SESSION_COOKIE)?.value, clientIp(request));
    return {};
  });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
  return response;
}
