import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { authenticateSession, type AuthenticatedUser } from "./auth.js";
import { HttpError } from "./errors.js";

export const SESSION_COOKIE = "nixhost_session";

export async function currentUser(): Promise<AuthenticatedUser | null> {
  const store = await cookies();
  return authenticateSession(store.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser(): Promise<AuthenticatedUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user as AuthenticatedUser;
}

export function requestUser(request: NextRequest): AuthenticatedUser {
  const user = authenticateSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new HttpError(401, "Authentication required", "unauthenticated");
  return user;
}

export function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-nixhost-client-ip") ??
    null
  );
}

export async function requestOriginAllowed(request: NextRequest): Promise<boolean> {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function serverClientIp(): Promise<string | null> {
  const values = await headers();
  return values.get("cf-connecting-ip") ?? values.get("x-nixhost-client-ip") ?? null;
}
