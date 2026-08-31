import { track } from "@vercel/analytics";

// Funnel instrumentation. Vercel Analytics is cookieless and does not collect
// personal data, so no consent banner is required — which also means we must
// never pass anything identifying here. Ids, emails and prompt text stay out;
// only the shape of the action goes in.
//
// Custom events are a paid Vercel Analytics feature. On Hobby the calls are
// harmless no-ops, so leaving them in costs nothing.

export type FunnelEvent =
  | "signup_started"
  | "signup_completed"
  | "project_created"
  | "video_requested"
  | "video_succeeded"
  | "video_failed"
  | "site_build_started"
  | "site_build_completed"
  | "site_edited"
  | "site_exported"
  | "site_published"
  | "site_deployed"
  | "integration_connected"
  | "checkout_started"
  | "portal_opened";

type Props = Record<string, string | number | boolean | null>;

export function trackEvent(event: FunnelEvent, props?: Props) {
  try {
    track(event, props);
  } catch {
    // Analytics must never break a user flow.
  }
}
