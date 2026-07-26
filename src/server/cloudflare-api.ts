import { HttpError } from "./errors.ts";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
}

export async function cloudflareApiRequest<T>(
  accessToken: string,
  resource: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_ORIGIN}${resource}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await readJson(response)) as CloudflareResponse<T>;
  if (!response.ok || !body.success) {
    throw new HttpError(
      502,
      body.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(", ") || `Cloudflare API returned HTTP ${response.status}`,
      "cloudflare_api_failed",
    );
  }
  return body.result;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new HttpError(
      502,
      `Cloudflare returned a non-JSON HTTP ${response.status} response`,
      "cloudflare_invalid_response",
    );
  }
}
