import { type NextRequest, NextResponse } from "next/server";
import { completeCloudflareAuthorization } from "@/server/cloudflare-oauth";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const destination = new URL("/integrations/cloudflare", request.url);
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const oauthError =
      request.nextUrl.searchParams.get("error_description") ??
      request.nextUrl.searchParams.get("error");
    if (oauthError) throw new Error(oauthError);
    if (!code || !state) throw new Error("Cloudflare did not return the required code and state");
    await completeCloudflareAuthorization({ code, state });
    destination.searchParams.set("authorization", "complete");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloudflare connection failed";
    logger.error("Cloudflare OAuth callback failed", { error: message });
    destination.searchParams.set("error", message.slice(0, 500));
  }
  return NextResponse.redirect(destination);
}
