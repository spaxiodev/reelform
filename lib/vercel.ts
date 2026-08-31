import { createHash } from "node:crypto";
import type { SiteFile } from "./site-bundle";

// Thin client for the Vercel REST API, scoped to what a deploy needs.
//
// Every call runs against the *user's* Vercel account with a token from their
// OAuth grant — Reelform never owns the project or the hosting bill.
// Docs: https://vercel.com/docs/rest-api

const API = "https://api.vercel.com";

export interface VercelAuth {
  accessToken: string;
  /** Set when the integration was installed on a team rather than a personal account. */
  teamId: string | null;
}

export class VercelError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "VercelError";
  }
}

/** The install URL a user is sent to; Vercel redirects back with a `code`. */
export function vercelAuthorizeUrl(state: string, redirectUri: string): string {
  const slug = process.env.VERCEL_INTEGRATION_SLUG?.trim();
  if (!slug) throw new Error("VERCEL_INTEGRATION_SLUG is not set");
  const url = new URL(`https://vercel.com/integrations/${slug}/new`);
  url.searchParams.set("state", state);
  // Vercel echoes the redirect back, so preview/staging deploys of Reelform
  // itself return to the origin the user actually started from.
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export interface VercelTokenResponse {
  access_token: string;
  team_id: string | null;
  user_id: string;
  installation_id?: string;
}

export async function exchangeVercelCode(
  code: string,
  redirectUri: string
): Promise<VercelTokenResponse> {
  const clientId = process.env.VERCEL_CLIENT_ID?.trim();
  const clientSecret = process.env.VERCEL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Vercel integration is not configured");

  const res = await fetch(`${API}/v2/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json().catch(() => null)) as (VercelTokenResponse & { error_description?: string }) | null;
  if (!res.ok || !body?.access_token) {
    throw new VercelError(body?.error_description ?? "Vercel rejected the authorization code", res.status);
  }
  return body;
}

async function call<T>(
  auth: VercelAuth,
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<T> {
  const url = new URL(`${API}${path}`);
  if (auth.teamId) url.searchParams.set("teamId", auth.teamId);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new VercelError(detail?.error?.message ?? `Vercel API error (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

/** Display name for the connected account — a team slug or the user's name. */
export async function vercelAccountName(auth: VercelAuth): Promise<string | null> {
  try {
    if (auth.teamId) {
      const team = await call<{ name?: string; slug?: string }>(auth, `/v2/teams/${auth.teamId}`);
      return team.name ?? team.slug ?? null;
    }
    const me = await call<{ user?: { name?: string; username?: string } }>(auth, "/v2/user");
    return me.user?.name ?? me.user?.username ?? null;
  } catch {
    return null; // cosmetic only — never block a connection on it
  }
}

/**
 * Uploads a file to Vercel's blob store, addressed by its SHA-1. Deployments
 * then reference files by digest, so re-deploying a site whose 30 MB hero
 * video has not changed re-uploads nothing.
 */
async function uploadFile(auth: VercelAuth, data: Uint8Array): Promise<{ sha: string; size: number }> {
  const sha = createHash("sha1").update(data).digest("hex");
  const url = new URL(`${API}/v2/files`);
  if (auth.teamId) url.searchParams.set("teamId", auth.teamId);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "x-vercel-digest": sha,
    },
    body: new Uint8Array(data),
    // Node needs this to stream a body; harmless elsewhere.
    duplex: "half",
  } as RequestInit);

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new VercelError(detail?.error?.message ?? `Upload failed (${res.status})`, res.status);
  }
  return { sha, size: data.byteLength };
}

export interface VercelDeployment {
  id: string;
  url: string; // host only, no scheme
  readyState: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED" | "INITIALIZING";
  projectId?: string;
  alias?: string[];
}

/**
 * Ships `files` as a production deployment of `projectName`, creating the
 * Vercel project on first push. The bundle is plain static output — no build
 * step — so `projectSettings` explicitly clears every framework default.
 */
export async function createVercelDeployment(
  auth: VercelAuth,
  projectName: string,
  files: SiteFile[]
): Promise<VercelDeployment> {
  const uploaded = await Promise.all(
    files.map(async (file) => ({ file: file.name, ...(await uploadFile(auth, file.data)) }))
  );

  return call<VercelDeployment>(auth, "/v13/deployments", {
    method: "POST",
    query: { forceNew: "1", skipAutoDetectionConfirmation: "1" },
    body: JSON.stringify({
      name: projectName,
      files: uploaded,
      target: "production",
      projectSettings: {
        framework: null,
        buildCommand: null,
        installCommand: null,
        devCommand: null,
        outputDirectory: null,
      },
    }),
  });
}

export async function getVercelDeployment(
  auth: VercelAuth,
  deploymentId: string
): Promise<VercelDeployment> {
  return call<VercelDeployment>(auth, `/v13/deployments/${deploymentId}`);
}

/**
 * Writes the site's Supabase credentials onto the Vercel project. The static
 * bundle already carries them inline (the anon key is a public value), but
 * a user who later points a real framework at this project gets a working
 * environment without hunting the keys down again.
 */
export async function upsertVercelEnv(
  auth: VercelAuth,
  projectId: string,
  vars: Record<string, string>
): Promise<void> {
  const body = Object.entries(vars).map(([key, value]) => ({
    key,
    value,
    type: "encrypted",
    target: ["production", "preview", "development"],
  }));
  if (body.length === 0) return;
  try {
    await call(auth, `/v10/projects/${projectId}/env`, {
      method: "POST",
      query: { upsert: "true" },
      body: JSON.stringify(body),
    });
  } catch {
    // A convenience, not part of what the user asked for — never fail a
    // successful deploy because the project's env could not be written.
  }
}
