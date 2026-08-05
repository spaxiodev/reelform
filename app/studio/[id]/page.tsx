import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isAdminUser } from "@/lib/admin";
import { Studio } from "@/components/Studio";

export const metadata = { title: "Studio — Reelform" };

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: project }, { data: profile }, { data: messages }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).single(),
    supabase.from("profiles").select("credits").eq("id", user.id).single(),
    supabase
      .from("messages")
      .select("role, target, content, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!project) redirect("/dashboard");

  return (
    <Studio
      project={project}
      initialCredits={profile?.credits ?? 0}
      initialMessages={messages ?? []}
      isAdmin={isAdminUser(user.id)}
    />
  );
}
