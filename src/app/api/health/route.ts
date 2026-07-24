import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  try {
    getDb().prepare("SELECT 1").get();
    return NextResponse.json(
      {
        ok: true,
        status: "ready",
        version: process.env.npm_package_version ?? "0.1.0",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
