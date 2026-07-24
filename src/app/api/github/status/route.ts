import type { NextRequest } from "next/server";
import { getDb } from "@/server/db";
import { getGitHubApp, installUrl } from "@/server/github";
import { api } from "@/server/http";
import { requestUser } from "@/server/next-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return api(request, () => {
    requestUser(request);
    const app = getGitHubApp();
    const installations = getDb()
      .prepare(
        "SELECT id, account_login, account_type, repository_selection, suspended_at FROM github_installations ORDER BY account_login",
      )
      .all();
    return {
      connected: Boolean(app),
      app: app
        ? { appId: app.app_id, slug: app.slug, htmlUrl: app.html_url, installUrl: installUrl() }
        : null,
      installations,
      webhookPublic: Boolean(process.env.NIXHOST_PUBLIC_URL),
    };
  });
}
