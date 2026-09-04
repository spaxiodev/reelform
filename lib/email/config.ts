import { CONTACT_EMAIL } from "@/lib/contact";
import { appUrl } from "@/lib/env";

// Everything the emails need to know about who is sending them. Kept in one
// place because CASL requires the same identity block (legal name, mailing
// address, a way to reach us) in every marketing message *and* in the
// consent request on the signup form.

/** The legal operator named in the footer of every email. */
export const SENDER_LEGAL_NAME = "Polidori.dev";
export const SENDER_PRODUCT = "Reelform";

/**
 * "Name <address>" used as the From header. Resend only accepts addresses on
 * a domain you have verified with it, so this has to be set per deployment.
 */
export function fromAddress(): string | null {
  return process.env.EMAIL_FROM?.trim() || null;
}

/** First name the welcome email signs off with. A person, not a team. */
export function senderFirstName(): string {
  return process.env.EMAIL_SENDER_NAME?.trim() || "Stefano";
}

/**
 * Physical mailing address. Required in every marketing email under CASL
 * (s. 6(2)) and worth having in transactional ones too. Public, since it is
 * also shown next to the consent checkbox on the signup form.
 */
export function postalAddress(): string | null {
  return process.env.NEXT_PUBLIC_POSTAL_ADDRESS?.trim() || null;
}

export function replyTo(): string {
  return process.env.EMAIL_REPLY_TO?.trim() || CONTACT_EMAIL;
}

export function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

/** Optional. When set, opted-in contacts are mirrored into this Resend audience. */
export function resendAudienceId(): string | null {
  return process.env.RESEND_AUDIENCE_ID?.trim() || null;
}

export function unsubscribeSecret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || null;
}

/** Can we send anything at all? */
export function transactionalEnabled(): boolean {
  return Boolean(resendApiKey() && fromAddress());
}

/**
 * Marketing has a higher bar: without an unsubscribe secret there is no
 * working unsubscribe link, and without a postal address the message would
 * be non-compliant on its face. Either missing means we simply don't send.
 */
export function marketingEnabled(): boolean {
  return transactionalEnabled() && Boolean(unsubscribeSecret() && postalAddress());
}

export const SITE_URL = appUrl;
