const URL_CANDIDATE = /https:\/\/[^\s"'<>]+/gi;
const TRY_CLOUDFLARE_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/i;

export function parseQuickTunnelUrl(value: string): string | null {
  for (const candidate of value.match(URL_CANDIDATE) ?? []) {
    try {
      const url = new URL(candidate.replace(/[),.;\]}]+$/, ""));
      if (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        TRY_CLOUDFLARE_HOST.test(url.hostname)
      ) {
        return url.origin.toLowerCase();
      }
    } catch {
      // Continue scanning other log fragments.
    }
  }
  return null;
}
