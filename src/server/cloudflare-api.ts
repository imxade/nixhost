import { z } from "zod";
import { config } from "./config.ts";
import { HttpError } from "./errors.ts";

const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const TOKEN_ENDPOINT = "https://dash.cloudflare.com/oauth2/token";

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
  result_info?: { page?: number; total_pages?: number };
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

export interface CloudflareOAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
}

export interface CloudflareOAuthAccount {
  id: string;
  name: string;
}

export interface CloudflareOAuthZone {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
}

export async function exchangeCloudflareAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<CloudflareOAuthTokens> {
  return requestOAuthToken({
    grant_type: "authorization_code",
    client_id: oauthClientId(),
    code: input.code,
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
  });
}

export async function refreshCloudflareOAuthToken(
  refreshToken: string,
): Promise<CloudflareOAuthTokens> {
  return requestOAuthToken({
    grant_type: "refresh_token",
    client_id: oauthClientId(),
    refresh_token: refreshToken,
  });
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

export async function listCloudflareOAuthResources(accessToken: string): Promise<{
  accounts: CloudflareOAuthAccount[];
  zones: CloudflareOAuthZone[];
}> {
  const [accounts, zones] = await Promise.all([
    paginatedCloudflareRequest<{ id: string; name: string }>(accessToken, "/accounts"),
    paginatedCloudflareRequest<{
      id: string;
      name: string;
      account?: { id?: string; name?: string };
    }>(accessToken, "/zones", { status: "active" }),
  ]);
  const normalizedAccounts = accounts
    .filter((account) => account.id && account.name)
    .map((account) => ({ id: account.id, name: account.name }));
  const accountNames = new Map(normalizedAccounts.map((account) => [account.id, account.name]));
  return {
    accounts: normalizedAccounts,
    zones: zones
      .filter((zone) => zone.id && zone.name && zone.account?.id)
      .map((zone) => ({
        id: zone.id,
        name: zone.name,
        accountId: zone.account?.id ?? "",
        accountName: zone.account?.name ?? accountNames.get(zone.account?.id ?? "") ?? "Cloudflare",
      })),
  };
}

export function cloudflareOAuthClientConfigured(): boolean {
  return Boolean(
    config.NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID &&
      config.NIXHOST_CLOUDFLARE_OAUTH_REDIRECT_URI &&
      config.NIXHOST_CLOUDFLARE_OAUTH_SCOPES,
  );
}

export function cloudflareOAuthScopes(): string {
  const scopes = config.NIXHOST_CLOUDFLARE_OAUTH_SCOPES;
  if (!scopes) {
    throw new HttpError(
      503,
      "Cloudflare OAuth is not configured on this NixHost distribution",
      "cloudflare_oauth_unavailable",
    );
  }
  return scopes;
}

export function cloudflareOAuthRedirectUri(): string {
  const redirectUri = config.NIXHOST_CLOUDFLARE_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    throw new HttpError(
      503,
      "Cloudflare OAuth is not configured on this NixHost distribution",
      "cloudflare_oauth_unavailable",
    );
  }
  return redirectUri;
}

export function cloudflareOAuthAuthorizationEndpoint(): string {
  return "https://dash.cloudflare.com/oauth2/auth";
}

function oauthClientId(): string {
  const clientId = config.NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(
      503,
      "Cloudflare OAuth is not configured on this NixHost distribution",
      "cloudflare_oauth_unavailable",
    );
  }
  return clientId;
}

async function requestOAuthToken(
  parameters: Record<string, string>,
): Promise<CloudflareOAuthTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = z
      .object({
        error: z.string().optional(),
        error_description: z.string().optional(),
      })
      .safeParse(body);
    throw new HttpError(
      502,
      error.success
        ? (error.data.error_description ?? error.data.error ?? "Cloudflare OAuth failed")
        : `Cloudflare OAuth returned HTTP ${response.status}`,
      "cloudflare_oauth_failed",
    );
  }
  const token = tokenSchema.parse(body);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : null,
    scope: token.scope ?? null,
  };
}

async function paginatedCloudflareRequest<T>(
  accessToken: string,
  resource: string,
  query: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const search = new URLSearchParams({ ...query, page: String(page), per_page: "50" });
    const response = await fetch(`${API_ORIGIN}${resource}?${search}`, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
    });
    const body = (await readJson(response)) as CloudflareResponse<T[]>;
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
    results.push(...body.result);
    if (!body.result_info?.total_pages || page >= body.result_info.total_pages) break;
  }
  return results;
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
