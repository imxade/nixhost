import path from "node:path";
import type { NextRequest } from "next/server";
import { getDeployment } from "@/server/app-service";
import { deploymentLogSize, readDeploymentLogRange } from "@/server/deployment-logs";
import { requestUser } from "@/server/next-auth";
import { appPaths } from "@/server/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context): Promise<Response> {
  try {
    requestUser(request);
    const { id } = await context.params;
    const deployment = getDeployment(id);
    const locations = appPaths(deployment.app_id);
    const files = [
      {
        stream: "stdout",
        file: path.join(/*turbopackIgnore: true*/ locations.logs, `${id}.stdout.log`),
      },
      {
        stream: "stderr",
        file: path.join(/*turbopackIgnore: true*/ locations.logs, `${id}.stderr.log`),
      },
    ];
    const encoder = new TextEncoder();
    let interval: NodeJS.Timeout | undefined;
    let lastDeploymentStatus = "";
    const offsets = new Map<string, number>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (stream: string, text: string) => {
          controller.enqueue(
            encoder.encode(`event: log\ndata: ${JSON.stringify({ stream, text })}\n\n`),
          );
        };
        for (const item of files) {
          const size = deploymentLogSize(item.file);
          offsets.set(item.file, Math.max(0, size - 128 * 1024));
        }
        const poll = () => {
          try {
            const current = getDeployment(id);
            const deploymentStatus = JSON.stringify({
              state: current.state,
              commit: current.commit_sha,
              failure: current.failure_message,
            });
            if (deploymentStatus !== lastDeploymentStatus) {
              lastDeploymentStatus = deploymentStatus;
              const revision = current.commit_sha || current.requested_ref;
              send(
                "deployment",
                [
                  `[deployment] ${current.state} · ${current.trigger} · ${revision.slice(0, 12)}`,
                  current.failure_message ? `[error] ${current.failure_message}` : "",
                ]
                  .filter(Boolean)
                  .join("\n")
                  .concat("\n"),
              );
            }
          } catch {
            if (interval) clearInterval(interval);
            controller.close();
            return;
          }
          for (const item of files) {
            const offset = offsets.get(item.file) ?? 0;
            const chunk = readDeploymentLogRange(item.file, offset, 256 * 1024);
            if (chunk.nextOffset !== offset) offsets.set(item.file, chunk.nextOffset);
            if (chunk.text) send(item.stream, `\n[${item.stream}]\n${chunk.text}`);
          }
        };
        poll();
        interval = setInterval(poll, 500);
        interval.unref();
      },
      cancel() {
        if (interval) clearInterval(interval);
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
  } catch {
    return Response.json(
      { ok: false, error: { code: "unauthenticated", message: "Authentication required" } },
      { status: 401 },
    );
  }
}
