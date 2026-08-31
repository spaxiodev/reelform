import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl } from "./env";
import type { Provider } from "./integrations";

// Shared plumbing for the two OAuth handshakes (Vercel, Supabase).
//
// The state and PKCE verifier have to survive a round trip through the
// provider, so they live in short-lived httpOnly cookies rather than in the
// URL — a `state` the browser cannot read is a `state` an attacker cannot
// forge into a CSRF'd connection.

const TTL_SECONDS = 600; // ten minutes to finish an authorization

function cookieName(provider: Provider, part: "state" | "verifier" | "next"): string {
  return `rf_oauth_${provider}_${part}`;
}

export function callbackUrl(provider: Provider): string {
  return `${appUrl()}/api/integrations/${provider}/callback`;
}

export interface Handshake {
  state: string;
  /** PKCE challenge derived from the stored verifier (Supabase requires it). */
  codeChallenge: string;
}

/** Mints a state + PKCE pair and stashes the secret halves in cookies. */
export async function beginHandshake(provider: Provider, next: string): Promise<Handshake> {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");

  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL_SECONDS,
  };
  jar.set(cookieName(provider, "state"), state, options);
  jar.set(cookieName(provider, "verifier"), verifier, options);
  jar.set(cookieName(provider, "next"), next, options);

  return { state, codeChallenge };
}

export interface HandshakeResult {
  verifier: string;
  next: string;
}

/**
 * Validates the state echoed back by the provider and returns the stored
 * verifier. Returns null when the state is missing, expired or mismatched —
 * the caller should treat that as a failed connection, not retry it.
 */
export async function completeHandshake(
  provider: Provider,
  state: string | null
): Promise<HandshakeResult | null> {
  const jar = await cookies();
  const expected = jar.get(cookieName(provider, "state"))?.value;
  const verifier = jar.get(cookieName(provider, "verifier"))?.value;
  const next = jar.get(cookieName(provider, "next"))?.value ?? "/account/integrations";

  for (const part of ["state", "verifier", "next"] as const) {
    jar.delete(cookieName(provider, part));
  }

  if (!state || !expected || !verifier || state !== expected) return null;
  return { verifier, next };
}

/** Keeps post-connect redirects on our own origin. */
export function safeNext(value: string | null, fallback = "/account/integrations"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
