import Link from "next/link";
import { redirect } from "next/navigation";
import { PRIVATE_PAGE } from "@/lib/seo";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listIntegrationStatus } from "@/lib/integrations";
import { IntegrationSettings } from "@/components/IntegrationSettings";
import { DEPLOY_MIN_PLAN, canDeploy, deploySiteLimit } from "@/lib/pricing";

export const metadata = { title: "Integrations", ...PRIVATE_PAGE };

// Errors from the OAuth callback come back as ?error=: they have nowhere else
// to put them.
const ERRORS: Record<string, string> = {
  denied: "You cancelled the connection. Nothing was changed.",
  state_mismatch: "That connection link expired. Start it again from this page.",
  exchange_failed: "The provider refused the connection. Try again.",
  not_configured: "Deploy integrations are not configured on this server yet.",
  unknown_provider: "Unknown provider.",
  no_code: "The provider did not send an authorization back.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/integrations");

  const [{ data: profile }, integrations, { count: liveCount }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    listIntegrationStatus(user.id),
    supabase.from("projects").select("id", { count: "exact", head: true }).not("live_at", "is", null),
  ]);

  const plan = profile?.plan ?? "free";
  const limit = deploySiteLimit(plan);

  return (
    <div className="space-y-4">
      {connected && (
        <p className="card p-4 text-sm text-primary-deep bg-primary-soft/50">
          {connected === "vercel" ? "Vercel" : "Supabase"} connected. You can publish from any
          finished site in the studio.
        </p>
      )}
      {error && <p className="card p-4 text-sm text-red-700">{ERRORS[error] ?? "Something went wrong."}</p>}

      <div className="card p-6">
        <p className="mono-label">DEPLOYMENTS</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">Ship sites to your own stack</h1>
        <p className="mt-3 text-sm text-muted leading-relaxed max-w-prose">
          Connect the accounts you already pay for and Reelform will push finished sites straight
          into them: hosting on Vercel, forms and data on Supabase. Nothing is hosted by us, so
          your site outlives your subscription.
        </p>
        {canDeploy(plan) ? (
          <p className="mt-4 text-sm">
            <span className="font-mono text-primary">
              {liveCount ?? 0} / {limit}
            </span>{" "}
            <span className="text-muted">sites live on your plan.</span>
          </p>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Deploying starts on {DEPLOY_MIN_PLAN.name}.{" "}
            <Link href="/pricing" className="font-medium text-primary hover:text-primary-deep">
              Compare plans →
            </Link>
          </p>
        )}
      </div>

      <IntegrationSettings integrations={integrations} />
    </div>
  );
}
