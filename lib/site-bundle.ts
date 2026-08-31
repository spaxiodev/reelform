import type { SupabaseClient } from "@supabase/supabase-js";
import { listVideos, readyVideos } from "./videos";
import { SUBMISSIONS_TABLE } from "./supabase-mgmt";

// Turns a finished project into the set of files that *is* the site: the
// generated HTML plus every video it features, with the remote video URLs
// rewritten to sit next to index.html.
//
// One builder serves all three destinations — the zip download, a Vercel
// deployment, and a Supabase Storage bucket — so a site cannot behave one way
// when downloaded and another way when deployed.

export interface SiteFile {
  /** Path inside the bundle, relative to its root (e.g. "index.html"). */
  name: string;
  data: Uint8Array;
  contentType: string;
}

export interface BundleProject {
  id: string;
  name: string | null;
  site_html: string | null;
}

/** Supabase credentials to wire the site's forms up to, if any. */
export interface FormBackend {
  url: string;
  anonKey: string;
}

export interface BundleOptions {
  backend?: FormBackend;
}

export class BundleError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BundleError";
  }
}

export function slugify(name: string): string {
  return (
    name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase() || "site"
  );
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
};

export async function buildSiteBundle(
  supabase: SupabaseClient,
  project: BundleProject,
  options: BundleOptions = {}
): Promise<{ slug: string; files: SiteFile[] }> {
  if (!project.site_html) {
    throw new BundleError("Nothing to package yet — build the site first.", 404);
  }

  let html = project.site_html;
  const files: SiteFile[] = [];

  const videos = readyVideos(await listVideos(supabase, project.id));
  for (const [i, video] of videos.entries()) {
    const ext = (new URL(video.url).pathname.match(/\.(mp4|webm|mov|m4v)$/i)?.[1] ?? "mp4").toLowerCase();
    const localName = i === 0 ? `video.${ext}` : `video-${i + 1}.${ext}`;
    let res: Response;
    try {
      res = await fetch(video.url);
    } catch {
      throw new BundleError("Could not fetch one of the videos — try again in a moment.", 502);
    }
    if (!res.ok) {
      throw new BundleError("Could not fetch one of the videos — try again in a moment.", 502);
    }
    files.push({
      name: localName,
      data: new Uint8Array(await res.arrayBuffer()),
      contentType: VIDEO_TYPES[ext] ?? "video/mp4",
    });

    // The generator embeds the URL verbatim; it can also appear HTML-escaped
    // (&amp;) inside attributes, so swap both spellings.
    for (const variant of [video.url, video.url.replace(/&/g, "&amp;")]) {
      html = html.split(variant).join(localName);
    }
  }

  if (options.backend) {
    html = withFormBackend(html, options.backend, project);
  }

  files.unshift({
    name: "index.html",
    data: new TextEncoder().encode(html),
    contentType: "text/html; charset=utf-8",
  });

  return { slug: slugify(project.name ?? "site"), files };
}

/**
 * Appends the script that makes the site's forms actually do something: every
 * submit is posted straight to the owner's Supabase `site_submissions` table.
 *
 * The anon key is embedded in the page on purpose — it is a public identifier,
 * and the table's RLS grants it insert and nothing else (see
 * provisionSiteBackend). A form that names an `action` is left alone, on the
 * assumption the owner pointed it somewhere deliberately.
 */
function withFormBackend(html: string, backend: FormBackend, project: BundleProject): string {
  const config = JSON.stringify({
    url: backend.url,
    key: backend.anonKey,
    table: SUBMISSIONS_TABLE,
    siteId: project.id,
    siteName: project.name ?? "",
  });

  const script = `
<!-- Reelform → Supabase form handling -->
<script>
(function () {
  var cfg = ${config};
  var endpoint = cfg.url + "/rest/v1/" + cfg.table;

  function collect(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      if (value instanceof File) return; // file uploads need Storage, not a row
      payload[key] = payload[key] ? [].concat(payload[key], value) : value;
    });
    return payload;
  }

  function status(form, message, ok) {
    var el = form.querySelector("[data-reelform-status]");
    if (!el) {
      el = document.createElement("p");
      el.setAttribute("data-reelform-status", "");
      el.style.marginTop = "0.75rem";
      form.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = ok ? "1" : "0.85";
  }

  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || form.hasAttribute("action")) return;
    event.preventDefault();

    var button = form.querySelector("button[type=submit], button:not([type]), input[type=submit]");
    if (button) button.disabled = true;

    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        Authorization: "Bearer " + cfg.key,
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        site_id: cfg.siteId,
        site_name: cfg.siteName,
        form: form.getAttribute("name") || form.id || "contact",
        payload: collect(form)
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        status(form, "Thanks — we got your message.", true);
      })
      .catch(function () {
        status(form, "Something went wrong. Please try again.", false);
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  });
})();
</script>
`;

  return html.includes("</body>")
    ? html.replace(/<\/body>/i, `${script}</body>`)
    : html + script;
}
