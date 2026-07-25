import { setSetting, setting } from "./db.ts";
import { getGitHubApp, updateAppWebhook } from "./github.ts";
import { logger } from "./logger.ts";
import { preferredPublicDashboardRoute } from "./public-origin.ts";

const WEBHOOK_BASE_SETTING = "github_webhook_public_base";

export function preferredGitHubWebhookBase(): string | null {
  return preferredPublicDashboardRoute()?.baseUrl ?? null;
}

export async function synchronizeGitHubWebhook(force = false): Promise<boolean> {
  if (!getGitHubApp()) return false;
  const preferred = preferredGitHubWebhookBase();
  const previous = setting(WEBHOOK_BASE_SETTING) ?? null;
  if (!force && previous === (preferred ?? "")) return false;
  try {
    await updateAppWebhook(preferred);
    setSetting(WEBHOOK_BASE_SETTING, preferred ?? "");
    logger.info("GitHub webhook route synchronized", { publicBase: preferred });
    return true;
  } catch (error) {
    logger.warn("GitHub webhook route synchronization failed", {
      publicBase: preferred,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
