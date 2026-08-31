import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getIntegration } from "@/lib/integrations";
import { listOrganizations, listProjects } from "@/lib/supabase-mgmt";

// Feeds the "which Supabase project?" picker in the deploy panel. Vercel needs
// no equivalent — a deploy creates or reuses a project by name on its own.
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  if (provider !== "supabase") {
    return NextResponse.json({ error: "No project list for this provider" }, { status: 404 });
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const integration = await getIntegration(user.id, "supabase");
  if (!integration) {
    return NextResponse.json({ error: "Supabase is not connected" }, { status: 409 });
  }

  try {
    const [organizations, projects] = await Promise.all([
      listOrganizations(integration.accessToken),
      listProjects(integration.accessToken),
    ]);
    return NextResponse.json({
      organizations,
      projects: projects.map((p) => ({
        ref: p.ref ?? p.id,
        name: p.name,
        status: p.status,
        organizationId: p.organization_id,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach Supabase — try reconnecting the account." },
      { status: 502 }
    );
  }
}
