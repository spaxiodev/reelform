import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Symmetric encryption for the third-party OAuth tokens we hold on a user's
// behalf (their Vercel and Supabase accounts). A leaked database dump alone
// must not be enough to deploy to a customer's infrastructure, so the tokens
// are sealed with a key that only ever lives in the app environment.
//
// AES-256-GCM: the auth tag makes a tampered ciphertext fail loudly rather
// than decrypt to garbage.

const IV_BYTES = 12; // GCM standard nonce length
const SALT = "reelform.integrations.v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.INTEGRATION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "INTEGRATION_SECRET is missing or too short (needs 32+ chars) — " +
        "connecting Vercel or Supabase accounts is disabled until it is set."
    );
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** Seals a token for storage. Output is `iv.tag.ciphertext`, all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** Reverses {@link encryptSecret}. Throws if the value was tampered with. */
export function decryptSecret(sealed: string): string {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !body) throw new Error("Malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** True when INTEGRATION_SECRET is usable — lets callers degrade gracefully. */
export function secretsConfigured(): boolean {
  return (process.env.INTEGRATION_SECRET?.trim().length ?? 0) >= 32;
}
