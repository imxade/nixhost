import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { changeOwnPassword } from "@/server/auth";
import { api, isFormSubmission, readFormUrlEncoded, readJson } from "@/server/http";
import { clientIp, requestUser, SESSION_COOKIE } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().min(12).max(256),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "New password and confirmation do not match",
  });

export async function POST(request: NextRequest) {
  const formSubmission = isFormSubmission(request);
  const apiResponse = await api(request, async () => {
    const user = requestUser(request);
    const currentSessionToken = request.cookies.get(SESSION_COOKIE)?.value;
    if (!currentSessionToken) throw new Error("Authenticated session cookie is missing");
    const raw = formSubmission ? await readFormUrlEncoded(request) : await readJson(request);
    const input = schema.parse(raw);
    await changeOwnPassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      userId: user.id,
      currentSessionToken,
      ip: clientIp(request),
    });
    return {};
  });
  return formSubmission
    ? new NextResponse(null, {
        status: 303,
        headers: {
          location: apiResponse.ok
            ? "/account?passwordChanged=1"
            : "/account?error=password_change_failed",
        },
      })
    : apiResponse;
}
