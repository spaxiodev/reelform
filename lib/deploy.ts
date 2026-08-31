import { createSupabaseAdmin } from "./supabase/admin";
import { getIntegration } from "./integrations";
import { canDeploy, deploySiteLimit, DEPLOY_MIN_PLAN } from "./pricing";
import { BundleError, buildSiteBundle, slugify, type BundleProject } from "./site-bundle";
import {
  createProject,
  getProjectKeys,
  listOrganizations,
  provisionSiteBackend,
  publishToStorage,
  type ProjectKeys,
} from "./supabase-mgmt";
import { createVercelDeployment, getVercelDeployment, upsertVercelEnv, type VercelAuth } from "./vercel";

// Orchestrates "make this site real": provision the user's Supabase project so
// the site's forms have somewhere to write, then ship the static bundle to
// their Vercel account (and optionally to Supabase Storage as well).
//
// Both providers are the *user's own* accounts, reached with the OAuth tokens
// in lib/integrations.ts.

export class DeployError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "DeployError";
  }
}

export interface SupabaseTargetInput {
  /** Existing project ref to use. Omit with `organizationId` to create one. */
  ref?: string;
  organizationId?: string;
  name?: string;
  /** Also publish the static files to a public Storage bucket. */
  storage?: boolean;
}

export interface DeployInput {
  projectId: string;
  /** Ship the front end to the user's Vercel account. */
  vercel: boolean;
  /** Set up (or reuse) a Supabase project as the site's backend. */
  supabase?: SupabaseTargetInput | null;
}

export interface DeployResult {
  vercel?: { url: string; deploymentId: string; status: string; projectId: string | null };
  supabase?: { ref: string; url: string; storageUrl: string | null; dbPassword?: string };
}

interface ProjectRow extends BundleProject {
  user_id: string;
  vercel_project_id: string | null;
  supabase_project_ref: string | null;
  live_at: string | null;
}

/**
 * Everything that must be true before we touch a provider: the plan allows
 * deploys, the site exists, and the account is under its live-site cap.
 */
async function authorize(userId: string, projectId: string): Promise<ProjectRow> {
  const admin = createSupabaseAdmin();

  const { data: profile } = await admin
    .from("profiles")
    .select("plan, plan_status")
    .eq("id", userId)
    .single();

  if (!canDeploy(profile?.plan)) {
    throw new DeployError(
      `Deploying is a ${DEPLOY_MIN_PLAN.name} feature. Upgrade to push sites live.`,
      402,
      "upgrade_required"
    );
  }
  if (profile?.plan_status === "past_due" || profile?.plan_status === "canceled") {
    throw new DeployError(
      "Your subscription needs attention before you can deploy again.",
      402,
      "plan_inactive"
    );
  }

  const { data: project } = await admin
    .from("projects")
    .select("id, name, site_html, user_id, vercel_project_id, supabase_project_ref, live_at")
    .eq("id", projectId)
    .eq("user_id", userId) // the admin client bypasses RLS, so scope by hand
    .single();

  if (!project) throw new DeployError("Project not found", 404);
  if (!project.site_html) {
    throw new DeployError("Build the site before deploying it.", 409, "no_site");
  }

  // Sites already live elsewhere count against the plan; re-deploying one that
  // is already live is always allowed.
  if (!project.live_at) {
    const { count } = await admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("live_at", "is", null);

    const limit = deploySiteLimit(profile?.plan);
    if ((count ?? 0) >= limit) {
      throw new DeployError(
        `Your plan keeps ${limit} sites live at once. Take one down, or upgrade for more.`,
        409,
        "site_limit"
      );
    }
  }

  return project as ProjectRow;
}

async function recordDeployment(
  fields: {
    projectId: string;
    userId: string;
    provider: "vercel" | "supabase";
    target: string;
    status: string;
    url?: string | null;
    externalId?: string | null;
    error?: string | null;
  }
): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin.from("deployments").insert({
    project_id: fields.projectId,
    user_id: fields.userId,
    provider: fields.provider,
    target: fields.target,
    status: fields.status,
    url: fields.url ?? null,
    external_id: fields.externalId ?? null,
    error: fields.error ?? null,
  });
}

/** Resolves which Supabase project to use, creating one when asked to. */
async function resolveSupabaseProject(
  token: string,
  project: ProjectRow,
  input: SupabaseTargetInput
): Promise<{ ref: string; dbPassword?: string }> {
  const ref = input.ref ?? project.supabase_project_ref;
  if (ref) return { ref };

  const organizationId = input.organizationId ?? (await listOrganizations(token))[0]?.id;
  if (!organizationId) {
    throw new DeployError(
      "That Supabase account has no organization to create a project in.",
      409,
      "no_organization"
    );
  }

  const created = await createProject(token, {
    name: input.name ?? slugify(project.name ?? "site"),
    organizationId,
  });
  return { ref: created.ref ?? created.id, dbPassword: created.dbPassword };
}

export async function deployProject(userId: string, input: DeployInput): Promise<DeployResult> {
  const project = await authorize(userId, input.projectId);
  const admin = createSupabaseAdmin();
  const result: DeployResult = {};
  const projectUpdates: Record<string, string | null> = {};

  // Building the bundle re-downloads every video from storage, so a publish
  // that goes to both Supabase Storage and Vercel builds it once and ships the
  // same bytes to both. Supabase runs first, so the backend keys, the only
  // thing that changes the bundle, are already known by the time it is built.
  let bundle: Awaited<ReturnType<typeof buildSiteBundle>> | null = null;
  const getBundle = async (backend?: { url: string; anonKey: string }) => {
    bundle ??= await buildSiteBundle(admin, project, { backend });
    return bundle;
  };

  // ── Supabase: the site's backend (and optionally its host) ─────────
  let backendKeys: ProjectKeys | null = null;

  if (input.supabase) {
    const integration = await getIntegration(userId, "supabase");
    if (!integration) {
      throw new DeployError("Connect your Supabase account first.", 409, "supabase_not_connected");
    }

    try {
      const { ref, dbPassword } = await resolveSupabaseProject(
        integration.accessToken,
        project,
        input.supabase
      );

      // A freshly created project spends a minute or two coming up; the API
      // rejects queries until then, so surface that rather than a raw 5xx.
      let keys: ProjectKeys;
      try {
        keys = await getProjectKeys(integration.accessToken, ref);
        await provisionSiteBackend(integration.accessToken, ref);
      } catch (err) {
        if (dbPassword) {
          // The project exists, remember it so the retry reuses it.
          await admin.from("projects").update({ supabase_project_ref: ref }).eq("id", project.id);
          throw new DeployError(
            "Your new Supabase project is still starting up. Try the deploy again in a minute.",
            503,
            "supabase_provisioning"
          );
        }
        throw err;
      }

      backendKeys = keys;
      projectUpdates.supabase_project_ref = ref;
      projectUpdates.supabase_url = keys.url;

      let storageUrl: string | null = null;
      if (input.supabase.storage) {
        if (!keys.serviceRoleKey) {
          throw new DeployError(
            "Reelform could not read that project's service key, so it cannot upload the site files.",
            502,
            "no_service_key"
          );
        }
        const staticFiles = await getBundle({ url: keys.url, anonKey: keys.anonKey });
        storageUrl = await publishToStorage(
          { ...keys, serviceRoleKey: keys.serviceRoleKey },
          `site-${slugify(project.name ?? "site")}`,
          staticFiles.files
        );
      }

      result.supabase = { ref, url: keys.url, storageUrl, dbPassword };
      await recordDeployment({
        projectId: project.id,
        userId,
        provider: "supabase",
        target: input.supabase.storage ? "backend+storage" : "backend",
        status: "ready",
        url: storageUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Supabase deploy failed";
      await recordDeployment({
        projectId: project.id,
        userId,
        provider: "supabase",
        target: input.supabase.storage ? "backend+storage" : "backend",
        status: "error",
        error: message,
      });
      throw err instanceof DeployError ? err : new DeployError(message, 502);
    }
  }

  // ── Vercel: the front end ──────────────────────────────────────────
  if (input.vercel) {
    const integration = await getIntegration(userId, "vercel");
    if (!integration) {
      throw new DeployError("Connect your Vercel account first.", 409, "vercel_not_connected");
    }
    const auth: VercelAuth = {
      accessToken: integration.accessToken,
      teamId: integration.accountId,
    };

    try {
      const site = await getBundle(
        backendKeys ? { url: backendKeys.url, anonKey: backendKeys.anonKey } : undefined
      );

      const deployment = await createVercelDeployment(auth, site.slug, site.files);

      if (deployment.projectId && backendKeys) {
        await upsertVercelEnv(auth, deployment.projectId, {
          NEXT_PUBLIC_SUPABASE_URL: backendKeys.url,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: backendKeys.anonKey,
        });
      }

      const url = `https://${deployment.url}`;
      projectUpdates.vercel_project_id = deployment.projectId ?? project.vercel_project_id;
      projectUpdates.vercel_url = url;

      result.vercel = {
        url,
        deploymentId: deployment.id,
        status: deployment.readyState,
        projectId: deployment.projectId ?? null,
      };
      await recordDeployment({
        projectId: project.id,
        userId,
        provider: "vercel",
        target: "hosting",
        status: deployment.readyState === "READY" ? "ready" : "building",
        url,
        externalId: deployment.id,
      });
    } catch (err) {
      const message =
        err instanceof BundleError || err instanceof DeployError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Vercel deploy failed";
      await recordDeployment({
        projectId: project.id,
        userId,
        provider: "vercel",
        target: "hosting",
        status: "error",
        error: message,
      });
      throw err instanceof DeployError ? err : new DeployError(message, 502);
    }
  }

  if (Object.keys(projectUpdates).length > 0) {
    await admin
      .from("projects")
      .update({ ...projectUpdates, live_at: new Date().toISOString() })
      .eq("id", project.id);
  }

  return result;
}

/**
 * Re-reads the newest Vercel deployment's state from the API. A static bundle
 * is usually READY within seconds, but the POST returns as soon as the upload
 * lands, so the studio polls this until it settles.
 */
export async function refreshDeploymentStatus(
  userId: string,
  projectId: string
): Promise<{ status: string; url: string | null } | null> {
  const admin = createSupabaseAdmin();
  const { data: row } = await admin
    .from("deployments")
    .select("id, external_id, status, url")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("provider", "vercel")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row?.external_id) return null;
  if (row.status === "ready" || row.status === "error") {
    return { status: row.status, url: row.url };
  }

  const integration = await getIntegration(userId, "vercel");
  if (!integration) return { status: row.status, url: row.url };

  try {
    const deployment = await getVercelDeployment(
      { accessToken: integration.accessToken, teamId: integration.accountId },
      row.external_id
    );
    const status =
      deployment.readyState === "READY"
        ? "ready"
        : deployment.readyState === "ERROR" || deployment.readyState === "CANCELED"
        ? "error"
        : "building";
    await admin
      .from("deployments")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return { status, url: row.url };
  } catch {
    return { status: row.status, url: row.url };
  }
}

/** Forgets where a project lives, freeing a slot under the plan's cap. */
export async function markProjectOffline(userId: string, projectId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin
    .from("projects")
    .update({ live_at: null, vercel_url: null })
    .eq("id", projectId)
    .eq("user_id", userId);
}
