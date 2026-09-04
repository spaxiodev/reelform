import { CONTACT_EMAIL } from "@/lib/contact";
import { SENDER_LEGAL_NAME, SENDER_PRODUCT, SITE_URL, postalAddress } from "./config";
import { unsubscribeUrl } from "./unsubscribe";

// The one email frame every message shares. It matches the auth templates in
// supabase/templates/ (same cream ground, dark wordmark band, orange button)
// so a receipt and a password reset look like they came from the same place.
//
// Every message is built twice, as HTML and as plain text, from the same
// pieces. The text copy is what screen readers, watches and strict mail
// clients show, so it is written, not stripped out of the HTML.

const FONT = "'Manrope',Helvetica,Arial,sans-serif";
const C = {
  ground: "#faf5f1",
  card: "#ffffff",
  line: "#efe6df",
  band: "#2a1a13",
  dot: "#ff6a3d",
  wordmark: "#ffd8c6",
  ink: "#2a1a13",
  body: "#4b3a33",
  muted: "#766159",
  cta: "#dd4f26",
  link: "#b23a17",
};

export interface Piece {
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The tiny bit of markup the copy is allowed: `[label](url)` for links and
 * `**bold**`. Everything else is escaped. Relative URLs are made absolute.
 */
function inline(s: string): Piece {
  const site = SITE_URL();
  const abs = (u: string) => (u.startsWith("/") ? site + u : u);

  let html = "";
  let text = "";
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const before = s.slice(last, m.index);
    html += escapeHtml(before);
    text += before;
    if (m[1] !== undefined) {
      const url = abs(m[2]);
      html += `<a href="${escapeHtml(url)}" style="color:${C.link}; text-decoration:underline;">${escapeHtml(m[1])}</a>`;
      text += `${m[1]} (${url})`;
    } else {
      html += `<strong style="color:${C.ink}; font-weight:600;">${escapeHtml(m[3])}</strong>`;
      text += m[3];
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = s.slice(last);
  html += escapeHtml(rest);
  text += rest;
  return { html, text };
}

export function p(s: string): Piece {
  const i = inline(s);
  return {
    html: `<p style="margin:0 0 18px 0; font-size:15px; line-height:1.6; color:${C.body};">${i.html}</p>`,
    text: `${i.text}\n\n`,
  };
}

/** Smaller, quieter paragraph for asides. */
export function note(s: string): Piece {
  const i = inline(s);
  return {
    html: `<p style="margin:0 0 18px 0; font-size:13px; line-height:1.6; color:${C.muted};">${i.html}</p>`,
    text: `${i.text}\n\n`,
  };
}

export function button(label: string, href: string): Piece {
  const url = href.startsWith("/") ? SITE_URL() + href : href;
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px 0;">
  <tr>
    <td style="background-color:${C.cta}; border-radius:10px;">
      <a href="${escapeHtml(url)}" style="display:inline-block; padding:14px 28px; font-family:${FONT}; font-size:13px; font-weight:600; letter-spacing:0.7px; text-transform:uppercase; color:#ffffff; text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`,
    text: `${label}: ${url}\n\n`,
  };
}

export function steps(items: string[]): Piece {
  const html = items
    .map((item, n) => {
      const i = inline(item);
      return `<tr>
  <td valign="top" style="padding:0 14px 14px 0; font-size:13px; font-weight:700; color:${C.cta}; font-family:${FONT}; white-space:nowrap;">${String(n + 1).padStart(2, "0")}</td>
  <td valign="top" style="padding:0 0 14px 0; font-size:15px; line-height:1.55; color:${C.body}; font-family:${FONT};">${i.html}</td>
</tr>`;
    })
    .join("");
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px 0;">${html}</table>`,
    text: items.map((item, n) => `${n + 1}. ${inline(item).text}`).join("\n") + "\n\n",
  };
}

/** Label / value pairs, for receipts. */
export function rows(pairs: [string, string][]): Piece {
  const html = pairs
    .map(
      ([k, v]) => `<tr>
  <td style="padding:10px 0; border-top:1px solid ${C.line}; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${C.muted}; font-family:${FONT};">${escapeHtml(k)}</td>
  <td align="right" style="padding:10px 0; border-top:1px solid ${C.line}; font-size:15px; color:${C.ink}; font-family:${FONT};">${escapeHtml(v)}</td>
</tr>`
    )
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0; border-bottom:1px solid ${C.line};">${html}</table>`,
    text: pairs.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\n",
  };
}

export function signoff(name: string): Piece {
  return {
    html: `<p style="margin:6px 0 0 0; font-size:15px; line-height:1.6; color:${C.body};">${escapeHtml(name)}<br /><span style="color:${C.muted};">${SENDER_PRODUCT}</span></p>`,
    text: `${name}\n${SENDER_PRODUCT}\n`,
  };
}

export type FooterKind = "transactional" | "marketing";

/** Who a message is going to, with what the footer needs to say about consent. */
export interface Recipient {
  userId: string;
  email: string;
  firstName: string | null;
  consentAt: string | null;
  consentSource: string | null;
}

export interface Frame {
  /** Hidden preview line mail clients show next to the subject. */
  preheader: string;
  /** Small uppercase label above the heading. */
  eyebrow: string;
  heading: string;
  body: Piece[];
  footer: FooterKind;
  /** Needed for the unsubscribe link and the "why you got this" line. */
  recipient: Recipient;
}

export interface Rendered {
  html: string;
  text: string;
}

function consentPhrase(source: string | null | undefined, at: string | null | undefined): string {
  const when = at
    ? ` on ${new Date(at).toLocaleDateString("en-CA", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Toronto",
      })}`
    : "";
  switch (source) {
    case "signup_form":
    case "signup_google":
      return `you ticked the updates box when you signed up${when}`;
    case "account_settings":
      return `you turned on updates in your account settings${when}`;
    default:
      return `you asked for updates from ${SENDER_PRODUCT}${when}`;
  }
}

function footer(kind: FooterKind, r: Frame["recipient"]): Piece {
  const site = SITE_URL();
  const address = postalAddress();
  const identity = `${SENDER_PRODUCT} is run by ${SENDER_LEGAL_NAME}${address ? `, ${address}` : ""}.`;

  const lines: Piece[] = [];

  if (kind === "marketing") {
    const unsub = unsubscribeUrl(r.userId) ?? `${site}/account`;
    const why = `You're getting this because ${consentPhrase(r.consentSource, r.consentAt)}.`;
    lines.push({
      html: `<p style="margin:0 0 8px 0; font-size:12px; line-height:1.6; color:${C.muted};">${escapeHtml(why)}
  <a href="${escapeHtml(unsub)}" style="color:${C.link}; text-decoration:underline;">Unsubscribe</a>
  &nbsp;&middot;&nbsp;
  <a href="${site}/account" style="color:${C.link}; text-decoration:underline;">Email preferences</a></p>`,
      text: `${why}\nUnsubscribe: ${unsub}\nEmail preferences: ${site}/account\n`,
    });
  } else {
    const why = `You're getting this because you have a ${SENDER_PRODUCT} account (${r.email}). Account emails like this one can't be turned off while the account exists.`;
    lines.push({
      html: `<p style="margin:0 0 8px 0; font-size:12px; line-height:1.6; color:${C.muted};">${escapeHtml(why)}</p>`,
      text: `${why}\n`,
    });
  }

  lines.push({
    html: `<p style="margin:0 0 8px 0; font-size:12px; line-height:1.6; color:${C.muted};">${escapeHtml(identity)}
  Write to us at <a href="mailto:${CONTACT_EMAIL}" style="color:${C.link}; text-decoration:underline;">${CONTACT_EMAIL}</a>.</p>`,
    text: `${identity} Write to us at ${CONTACT_EMAIL}.\n`,
  });

  lines.push({
    html: `<p style="margin:0; font-size:12px; line-height:1.6; color:${C.muted};">
  <a href="${site}/faq" style="color:${C.link}; text-decoration:none;">FAQ</a>
  &nbsp;&middot;&nbsp;
  <a href="${site}/contact" style="color:${C.link}; text-decoration:none;">Contact</a>
  &nbsp;&middot;&nbsp;
  <a href="${site}/privacy" style="color:${C.link}; text-decoration:none;">Privacy</a></p>`,
    text: `${site}/faq · ${site}/contact · ${site}/privacy\n`,
  });

  return {
    html: lines.map((l) => l.html).join("\n"),
    text: lines.map((l) => l.text).join(""),
  };
}

export function render(frame: Frame): Rendered {
  const f = footer(frame.footer, frame.recipient);
  const bodyHtml = frame.body.map((b) => b.html).join("\n");
  const bodyText = frame.body.map((b) => b.text).join("");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(frame.heading)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${C.ground};">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; height:0; width:0;">
      ${escapeHtml(frame.preheader)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.ground};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px; width:100%;">

            <tr>
              <td style="background-color:${C.card}; border:1px solid ${C.line}; border-radius:20px; overflow:hidden;">

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background-color:${C.band}; padding:20px 32px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="padding-right:10px; line-height:0;">
                            <div style="width:9px; height:9px; border-radius:50%; background-color:${C.dot}; font-size:0; line-height:0;">&nbsp;</div>
                          </td>
                          <td style="font-family:${FONT}; font-size:18px; font-weight:600; letter-spacing:-0.2px; color:#ffffff;">
                            Reel<span style="color:${C.wordmark};">form</span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:36px 32px 32px 32px; font-family:${FONT};">
                      <p style="margin:0 0 14px 0; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${C.muted};">${escapeHtml(frame.eyebrow)}</p>
                      <h1 style="margin:0 0 18px 0; font-size:28px; font-weight:600; line-height:1.15; color:${C.ink};">${escapeHtml(frame.heading)}</h1>
${bodyHtml}
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            <tr>
              <td style="padding:24px 32px 8px 32px; font-family:${FONT}; text-align:center;">
${f.html}
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${frame.heading}\n\n${bodyText}\n--\n${f.text}`;

  return { html, text };
}
