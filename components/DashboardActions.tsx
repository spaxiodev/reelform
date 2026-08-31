"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

// Starting a production is the /create flow now — the format choice, the brief
// and the shot controls all live there, so the dashboard just links into it.
export function NewProjectButton({ variant = "primary" }: { variant?: "primary" | "ghost" }) {
  return (
    <Link href="/create" className={variant === "primary" ? "btn-primary" : "btn-ghost"}>
      + New production
    </Link>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="cursor-pointer text-sm text-muted hover:text-ink transition-colors"
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
