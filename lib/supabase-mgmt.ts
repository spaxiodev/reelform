import { createClient } from "@supabase/supabase-js";
import type { SiteFile } from "./site-bundle";

// Client for the Supabase Management API, scoped to what "push my site to
// Supabase" needs: pick or create a project, give the site a table to write
// form submissions into, and optionally host the static files from Storage.
//
// Everything runs against the *user's* Supabase organization via their OAuth
// grant. Docs: https://supabase.com/docs/reference/api

const API = "https://api.supabase.com";

export class SupabaseMgmtError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "SupabaseMgmtError";
  }
}

// ── OAuth ────────────────────────────────────────────────────────────────
// Supabase requires PKCE, so the caller keeps the verifier (in a signed,
// httpOnly cookie) between the authorize redirect and the callback.

export function supabaseAuthorizeUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string
): string {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) throw new Error("SUPABASE_OAUTH_CLIENT_ID is not set");
  const url = new URL(`${API}/v1/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function tokenRequest(form: Record<string, string>): Promise<SupabaseTokenResponse> {
  const clientId = process.env.SUPABASE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.SUPABASE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Supabase integration is not configured");

  const res = await fetch(`${API}/v1/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(form),
  });
  const body = (await res.json().catch(() => null)) as
    | (SupabaseTokenResponse & { error_description?: string; message?: string })
    | null;
  if (!res.ok || !body?.access_token) {
    throw new SupabaseMgmtError(
      body?.error_description ?? body?.message ?? "Supabase rejected the authorization",
      res.status
    );
  }
  return body;
}

export function exchangeSupabaseCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<SupabaseTokenResponse> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
}

// Supabase access tokens live ~1 day, so this runs far more often than the
// initial exchange (see getIntegration in lib/integrations.ts).
export function refreshSupabaseToken(refreshToken: string): Promise<SupabaseTokenResponse> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// ── Management API ───────────────────────────────────────────────────────

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new SupabaseMgmtError(
      detail?.message ?? `Supabase API error (${res.status})`,
      res.status
    );
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export interface SupabaseOrg {
  id: string;
  name: string;
}

export interface SupabaseProject {
  id: string;
  ref?: string;
  name: string;
  region: string;
  status: string;
  organization_id: string;
}

export function listOrganizations(token: string): Promise<SupabaseOrg[]> {
  return call<SupabaseOrg[]>(token, "/v1/organizations");
}

export async function listProjects(token: string): Promise<SupabaseProject[]> {
  const projects = await call<SupabaseProject[]>(token, "/v1/projects");
  // The API returns the ref as `id`; normalise so callers have one field.
  return projects.map((p) => ({ ...p, ref: p.ref ?? p.id }));
}

export async function createProject(
  token: string,
  input: { name: string; organizationId: string; region?: string }
): Promise<SupabaseProject & { dbPassword: string }> {
  // Generated, shown to the user once in the deploy result, and never stored:
  // they can rotate it from the Supabase dashboard if they ever need it.
  const dbPassword = `Rf${Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url")}!`;
  const project = await call<SupabaseProject>(token, "/v1/projects", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      organization_id: input.organizationId,
      db_pass: dbPassword,
      region: input.region ?? "us-east-1",
    }),
  });
  return { ...project, ref: project.ref ?? project.id, dbPassword };
}

export function getProject(token: string, ref: string): Promise<SupabaseProject> {
  return call<SupabaseProject>(token, `/v1/projects/${ref}`);
}

export interface ProjectKeys {
  url: string;
  anonKey: string;
  serviceRoleKey: string | null;
}

export async function getProjectKeys(token: string, ref: string): Promise<ProjectKeys> {
  const keys = await call<{ name: string; api_key: string }[]>(
    token,
    `/v1/projects/${ref}/api-keys?reveal=true`
  );
  const anon = keys.find((k) => k.name === "anon");
  if (!anon) throw new SupabaseMgmtError("That Supabase project has no anon key yet", 409);
  return {
    url: `https://${ref}.supabase.co`,
    anonKey: anon.api_key,
    serviceRoleKey: keys.find((k) => k.name === "service_role")?.api_key ?? null,
  };
}

/** Runs SQL on the project's database via the management API. */
export function runSql<T = unknown>(token: string, ref: string, query: string): Promise<T> {
  return call<T>(token, `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
}

/** Name of the table a deployed site writes its form submissions into. */
export const SUBMISSIONS_TABLE = "site_submissions";

/**
 * Gives the user's Supabase project the one thing a generated static site
 * needs a backend for: somewhere to put what visitors type into its forms.
 *
 * The policy is insert-only for `anon` — the site ships with the anon key in
 * plain sight, so visitors must be able to add a row and nothing else. Reading
 * submissions requires the dashboard or a service-role key.
 */
export async function provisionSiteBackend(token: string, ref: string): Promise<void> {
  const sql = `
    create table if not exists public.${SUBMISSIONS_TABLE} (
      id uuid primary key default gen_random_uuid(),
      site_id text not null,
      site_name text,
      form text not null default 'contact',
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists ${SUBMISSIONS_TABLE}_site_idx
      on public.${SUBMISSIONS_TABLE} (site_id, created_at desc);

    alter table public.${SUBMISSIONS_TABLE} enable row level security;

    -- Visitors may drop something in the box; only the owner can open it.
    -- Inserts are unconditional because the site carries the anon key in
    -- plain sight, so there is nothing secret left to check against. The
    -- absence of a select policy is what keeps submissions private.
    drop policy if exists "${SUBMISSIONS_TABLE}_insert_anon" on public.${SUBMISSIONS_TABLE};
    create policy "${SUBMISSIONS_TABLE}_insert_anon"
      on public.${SUBMISSIONS_TABLE} for insert to anon, authenticated
      with check (site_id <> '');
  `;
  await runSql(token, ref, sql);
}

/**
 * Publishes the static bundle to a public Storage bucket — the cheap hosting
 * option for people who would rather not run a second provider. Returns the
 * public URL of the site's entry point.
 */
export async function publishToStorage(
  keys: ProjectKeys & { serviceRoleKey: string },
  bucket: string,
  files: SiteFile[]
): Promise<string> {
  const client = createClient(keys.url, keys.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: bucketError } = await client.storage.createBucket(bucket, { public: true });
  // "already exists" is the normal case on every deploy after the first.
  if (bucketError && !/exist/i.test(bucketError.message)) {
    throw new SupabaseMgmtError(`Could not create the storage bucket: ${bucketError.message}`, 502);
  }

  for (const file of files) {
    const { error } = await client.storage
      .from(bucket)
      .upload(file.name, new Uint8Array(file.data), {
        contentType: file.contentType,
        upsert: true,
      });
    if (error) {
      throw new SupabaseMgmtError(`Could not upload ${file.name}: ${error.message}`, 502);
    }
  }

  return `${keys.url}/storage/v1/object/public/${bucket}/index.html`;
}
