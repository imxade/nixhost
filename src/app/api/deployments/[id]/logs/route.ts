import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { getDeployment } from "@/server/app-service";
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
          try {
            const size = fs.statSync(item.file).size;
            offsets.set(item.file, Math.max(0, size - 128 * 1024));
          } catch {
            offsets.set(item.file, 0);
          }
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
            try {
              const stat = fs.statSync(item.file);
              if (stat.size < offset) offsets.set(item.file, 0);
              const currentOffset = stat.size < offset ? 0 : offset;
              if (stat.size <= currentOffset) continue;
              const maxRead = Math.min(stat.size - currentOffset, 256 * 1024);
              const buffer = Buffer.alloc(maxRead);
              const fd = fs.openSync(item.file, "r");
              const read = fs.readSync(fd, buffer, 0, maxRead, currentOffset);
              fs.closeSync(fd);
              offsets.set(item.file, currentOffset + read);
              const text = buffer.subarray(0, read).toString("utf8");
              send(item.stream, `\n[${item.stream}]\n${text}`);
            } catch {}
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
