import crypto from "node:crypto";
import {
  type CloudflareOAuthTokens,
  cloudflareOAuthAuthorizationEndpoint,
  cloudflareOAuthClientConfigured,
  cloudflareOAuthRedirectUri,
  cloudflareOAuthScopes,
  exchangeCloudflareAuthorizationCode,
  listCloudflareOAuthResources,
  refreshCloudflareOAuthToken,
} from "./cloudflare-api.ts";
import { config } from "./config.ts";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "./crypto.ts";
import { getDb, nowIso } from "./db.ts";
import { HttpError } from "./errors.ts";

interface OAuthSessionRow {
  user_id: string;
  verifier_encrypted: string;
  redirect_uri: string;
  expires_at: string;
}

interface PendingOAuthRow {
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
}

export function cloudflareOAuthStatus(userId?: string): {
  available: boolean;
  pending: boolean;
} {
  const pending = userId
    ? getDb()
        .prepare("SELECT 1 FROM cloudflare_oauth_pending WHERE singleton = 1 AND user_id = ?")
        .get(userId)
    : undefined;
  return {
    available: cloudflareOAuthClientConfigured(),
    pending: Boolean(pending),
  };
}

export function createCloudflareAuthorization(userId: string): string {
  if (!cloudflareOAuthClientConfigured()) {
    throw new HttpError(
      503,
      "Cloudflare OAuth is not configured on this NixHost distribution",
      "cloudflare_oauth_unavailable",
    );
  }
  const state = randomToken(32);
  const verifier = randomToken(64);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = cloudflareOAuthRedirectUri();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM cloudflare_oauth_sessions WHERE expires_at <= ?").run(now);
    db.prepare(
      `INSERT INTO cloudflare_oauth_sessions(
        state_hash, user_id, verifier_encrypted, redirect_uri, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sha256(state), userId, encryptSecret(verifier), redirectUri, expiresAt, now);
  })();
  const authorization = new URL(cloudflareOAuthAuthorizationEndpoint());
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", config.NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID ?? "");
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("scope", cloudflareOAuthScopes());
  authorization.searchParams.set("state", state);
  authorization.searchParams.set("code_challenge", challenge);
  authorization.searchParams.set("code_challenge_method", "S256");
  return authorization.toString();
}

export async function completeCloudflareAuthorization(input: {
  state: string;
  code: string;
}): Promise<{ userId: string }> {
  const db = getDb();
  const session = db
    .prepare(
      `DELETE FROM cloudflare_oauth_sessions
       WHERE state_hash = ?
       RETURNING user_id, verifier_encrypted, redirect_uri, expires_at`,
    )
    .get(sha256(input.state)) as OAuthSessionRow | undefined;
  if (!session || session.expires_at <= nowIso()) {
    throw new HttpError(
      400,
      "Cloudflare authorization expired or did not originate from this session",
      "cloudflare_oauth_state_invalid",
    );
  }
  const tokens = await exchangeCloudflareAuthorizationCode({
    code: input.code,
    codeVerifier: decryptSecret(session.verifier_encrypted),
    redirectUri: session.redirect_uri,
  });
  const now = nowIso();
  db.prepare(
    `INSERT INTO cloudflare_oauth_pending(
      singleton, user_id, access_token_encrypted, refresh_token_encrypted,
      access_token_expires_at, scope, created_at, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      user_id = excluded.user_id,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_expires_at = excluded.access_token_expires_at,
      scope = excluded.scope,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
  ).run(
    session.user_id,
    encryptSecret(tokens.accessToken),
    tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    tokens.expiresAt,
    tokens.scope,
    now,
    now,
  );
  return { userId: session.user_id };
}

export async function cloudflareOAuthOptions(userId: string) {
  const grant = await pendingCloudflareOAuthGrant(userId);
  return listCloudflareOAuthResources(grant.accessToken);
}

export async function pendingCloudflareOAuthGrant(userId: string): Promise<CloudflareOAuthTokens> {
  const row = getDb()
    .prepare("SELECT * FROM cloudflare_oauth_pending WHERE singleton = 1 AND user_id = ?")
    .get(userId) as PendingOAuthRow | undefined;
  if (!row) {
    throw new HttpError(
      409,
      "Complete Cloudflare authorization before selecting an account and zone",
      "cloudflare_oauth_not_pending",
    );
  }
  const current: CloudflareOAuthTokens = {
    accessToken: decryptSecret(row.access_token_encrypted),
    refreshToken: row.refresh_token_encrypted ? decryptSecret(row.refresh_token_encrypted) : null,
    expiresAt: row.access_token_expires_at,
    scope: row.scope,
  };
  if (!shouldRefresh(current.expiresAt)) return current;
  if (!current.refreshToken) {
    throw new HttpError(
      401,
      "Cloudflare authorization expired; connect Cloudflare again",
      "cloudflare_oauth_expired",
    );
  }
  const refreshed = await refreshCloudflareOAuthToken(current.refreshToken);
  const merged = {
    ...refreshed,
    refreshToken: refreshed.refreshToken ?? current.refreshToken,
    scope: refreshed.scope ?? current.scope,
  };
  savePendingGrant(userId, merged);
  return merged;
}

export function clearPendingCloudflareOAuthGrant(userId: string): void {
  getDb()
    .prepare("DELETE FROM cloudflare_oauth_pending WHERE singleton = 1 AND user_id = ?")
    .run(userId);
}

function savePendingGrant(userId: string, tokens: CloudflareOAuthTokens): void {
  getDb()
    .prepare(
      `UPDATE cloudflare_oauth_pending SET
        access_token_encrypted = ?,
        refresh_token_encrypted = ?,
        access_token_expires_at = ?,
        scope = ?,
        updated_at = ?
       WHERE singleton = 1 AND user_id = ?`,
    )
    .run(
      encryptSecret(tokens.accessToken),
      tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      tokens.expiresAt,
      tokens.scope,
      nowIso(),
      userId,
    );
}

function shouldRefresh(expiresAt: string | null): boolean {
  return Boolean(expiresAt && Date.parse(expiresAt) <= Date.now() + 120_000);
}
