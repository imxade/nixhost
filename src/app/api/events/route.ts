import type { NextRequest } from "next/server";
import { events, type PlatformEvent } from "@/server/events";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    requestUser(request);
  } catch {
    return Response.json({ ok: false, error: { code: "unauthenticated", message: "Authentication required" } }, { status: 401 });
  }
  const scope = request.nextUrl.searchParams.get("scope") ?? undefined;
  const lastId = Number(request.headers.get("last-event-id") ?? request.nextUrl.searchParams.get("lastEventId") ?? 0);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  const serialize = (event: PlatformEvent) =>
    encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events.since(Number.isFinite(lastId) ? lastId : 0, scope)) controller.enqueue(serialize(event));
      unsubscribe = events.subscribe((event) => {
        if (!scope || event.scope === scope || event.scope === "system") controller.enqueue(serialize(event));
      });
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`)), 15_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
