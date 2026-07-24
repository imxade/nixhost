import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getApplicationByRepositoryId, queueDeployment } from "@/server/app-service";
import { getDb, nowIso } from "@/server/db";
import { webhookSecret, syncInstallations } from "@/server/github";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const delivery = request.headers.get("x-github-delivery");
  const event = request.headers.get("x-github-event") ?? "unknown";
  const signature = request.headers.get("x-hub-signature-256");
  if (!delivery || !signature) return NextResponse.json({ error: "Missing GitHub webhook headers" }, { status: 400 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const body = await request.text();
  if (Buffer.byteLength(body) > MAX_WEBHOOK_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let secret: string;
  try {
    secret = webhookSecret();
  } catch {
    return NextResponse.json({ error: "GitHub is not configured" }, { status: 409 });
  }
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const db = getDb();
  const existing = db.prepare("SELECT status FROM webhook_deliveries WHERE delivery_id = ?").get(delivery);
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const repository = payload.repository as Record<string, unknown> | undefined;
  const repositoryId = repository?.id ? Number(repository.id) : null;
  db.prepare(
    `INSERT INTO webhook_deliveries(delivery_id, event_name, repository_id, received_at, status)
     VALUES (?, ?, ?, ?, 'received')`,
  ).run(delivery, event, repositoryId, nowIso());

  try {
    if (["installation", "installation_repositories"].includes(event)) {
      void syncInstallations().catch((error) => logger.warn("GitHub installation sync failed", { error: String(error) }));
    } else if (event === "push" && repositoryId) {
      const app = getApplicationByRepositoryId(repositoryId);
      if (app?.auto_deploy) {
        const ref = String(payload.ref ?? "");
        if (ref === `refs/heads/${app.branch}`) {
          const sha = String(payload.after ?? "");
          if (sha && !/^0+$/.test(sha)) {
            queueDeployment(app.id, { trigger: "github_push", commitSha: sha, requestedRef: sha });
          }
        }
      }
    }
    db.prepare("UPDATE webhook_deliveries SET status = 'processed', processed_at = ? WHERE delivery_id = ?").run(nowIso(), delivery);
    return NextResponse.json({ ok: true });
  } catch (error) {
    db.prepare("UPDATE webhook_deliveries SET status = 'failed', processed_at = ?, error = ? WHERE delivery_id = ?")
      .run(nowIso(), error instanceof Error ? error.message : String(error), delivery);
    logger.error("GitHub webhook processing failed", { delivery, event, error: String(error) });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
