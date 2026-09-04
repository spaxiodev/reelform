import { fromAddress, replyTo, resendApiKey, resendAudienceId } from "./config";

// Thin client over Resend's REST API. Plain fetch rather than the SDK: the
// surface we use is three endpoints, and one less dependency to keep current.

const API = "https://api.resend.com";

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Lets Resend drop a duplicate if a webhook is retried. */
  idempotencyKey?: string;
  tags?: Record<string, string>;
}

export class ResendError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const key = resendApiKey();
  if (!key) throw new ResendError("RESEND_API_KEY is not set", 0);

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Resend ${method} ${path} failed (${res.status})`;
    try {
      const err = (await res.json()) as { message?: string; name?: string };
      if (err.message) message = `${message}: ${err.message}`;
    } catch {
      /* body wasn't JSON */
    }
    throw new ResendError(message, res.status);
  }
  return (await res.json()) as T;
}

/** Sends one email. Returns Resend's message id. */
export async function sendEmail(input: SendInput): Promise<string> {
  const from = fromAddress();
  if (!from) throw new ResendError("EMAIL_FROM is not set", 0);

  const { id } = await call<{ id: string }>(
    "POST",
    "/emails",
    {
      from,
      to: [input.to],
      reply_to: replyTo(),
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({ name, value }))
        : undefined,
    },
    input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined
  );
  return id;
}

// ── Audience sync ──────────────────────────────────────────────────
// Optional mirror of the opted-in list into a Resend audience, so campaigns
// can be written and sent from Resend's Broadcasts screen instead of code.
// Our database stays the source of truth; the webhook route brings an
// unsubscribe made from a broadcast back here.

export interface ContactInput {
  email: string;
  firstName?: string | null;
  unsubscribed: boolean;
}

/** Creates or updates the contact. No-op when no audience is configured. */
export async function syncContact(input: ContactInput): Promise<void> {
  const audience = resendAudienceId();
  if (!audience) return;

  const payload = {
    email: input.email,
    first_name: input.firstName ?? undefined,
    unsubscribed: input.unsubscribed,
  };

  try {
    await call("POST", `/audiences/${audience}/contacts`, payload);
  } catch (err) {
    // Already there: fall through to an update by email.
    if (!(err instanceof ResendError) || err.status !== 409) throw err;
  }
  await call("PATCH", `/audiences/${audience}/contacts/${encodeURIComponent(input.email)}`, {
    unsubscribed: input.unsubscribed,
    first_name: input.firstName ?? undefined,
  });
}

/** Removes the contact entirely (account deletion). No-op without an audience. */
export async function removeContact(email: string): Promise<void> {
  const audience = resendAudienceId();
  if (!audience) return;
  try {
    await call("DELETE", `/audiences/${audience}/contacts/${encodeURIComponent(email)}`);
  } catch (err) {
    if (err instanceof ResendError && err.status === 404) return;
    throw err;
  }
}
