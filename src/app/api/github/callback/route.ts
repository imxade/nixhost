import { NextResponse, type NextRequest } from "next/server";
import { convertManifest, installUrl, verifyManifestState } from "@/server/github";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  try {
    if (!code || !state) throw new Error("GitHub did not return the required code and state");
    verifyManifestState(state);
    await convertManifest(code);
    return NextResponse.redirect(installUrl());
  } catch (error) {
    logger.error("GitHub App manifest callback failed", { error: error instanceof Error ? error.message : String(error) });
    const url = new URL("/github/complete", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "GitHub connection failed");
    return NextResponse.redirect(url);
  }
}
