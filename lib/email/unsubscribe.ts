import { createHmac, timingSafeEqual } from "node:crypto";
import { unsubscribeSecret, SITE_URL } from "./config";

// Unsubscribe links carry a signed token instead of a database row: the link
// keeps working for as long as the account exists, needs no lookup to
// validate, and cannot be guessed for someone else's account.
//
// Token shape: <user id>.<base64url HMAC-SHA256(user id)>

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

export function unsubscribeToken(userId: string): string | null {
  const secret = unsubscribeSecret();
  if (!secret) return null;
  return `${userId}.${sign(userId, secret)}`;
}

/** Returns the user id the token was minted for, or null if it doesn't verify. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  const secret = unsubscribeSecret();
  if (!secret || !token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sign(userId, secret);
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  return userId;
}

export function unsubscribeUrl(userId: string): string | null {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  return `${SITE_URL()}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Endpoint mail clients POST to for RFC 8058 one-click unsubscribe. */
export function unsubscribePostUrl(userId: string): string | null {
  const token = unsubscribeToken(userId);
  if (!token) return null;
  return `${SITE_URL()}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
