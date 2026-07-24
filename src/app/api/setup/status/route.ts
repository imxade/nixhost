import { NextResponse } from "next/server";
import { isSetupComplete } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ ok: true, data: { complete: isSetupComplete() } });
}
