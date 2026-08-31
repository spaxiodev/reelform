// The public release log. Newest first — the page and the sitemap both read
// from here, so adding an entry is a one-file change.
//
// Dates are ISO so they sort and format reliably; `date` is the release day,
// not the day it was written.

export interface Release {
  version: string;
  date: string; // YYYY-MM-DD
  title: string;
  /** "added" ships new capability, "improved" refines it, "fixed" repairs it. */
  changes: { kind: "added" | "improved" | "fixed"; text: string }[];
}

export const RELEASES: Release[] = [
  {
    version: "1.1.0",
    date: "2026-08-06",
    title: "Several videos per site",
    changes: [
      {
        kind: "added",
        text: "A production can now hold up to six clips — a hero plus section footage — each with its own shot, playback mode and name.",
      },
      {
        kind: "added",
        text: "Ask for the next video in plain language and Claude works out the shot, names the slot and sends it to render.",
      },
      {
        kind: "added",
        text: "Exports now package every clip alongside the HTML, with the video URLs rewritten to the local files.",
      },
      {
        kind: "improved",
        text: "Hourly limits on the generation endpoints, so a runaway script can't burn through an account.",
      },
      {
        kind: "fixed",
        text: "A clip whose render failed while two browser tabs were open could refund its credits twice.",
      },
      {
        kind: "fixed",
        text: "Deleting a clip mid-render forfeited the credits it had already cost. It now waits for the render to settle.",
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-07-19",
    title: "Reelform is live",
    changes: [
      {
        kind: "added",
        text: "Direct a cinematic hero video with Seedance, reshoot until it's right, then let Claude build a complete site around it.",
      },
      {
        kind: "added",
        text: "Two playback modes: ambient loop, or scroll-scrub where the footage advances frame by frame as visitors scroll.",
      },
      {
        kind: "added",
        text: "Keep editing by chat — every instruction streams into the live preview.",
      },
      {
        kind: "added",
        text: "Publish to the public showcase, or download a single-file site and host it anywhere.",
      },
      {
        kind: "added",
        text: "Credit-based pricing with automatic refunds whenever a generation fails.",
      },
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0];
