"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { SiteFooter } from "@/components/SiteFooter";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(
    searchParams.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get("error") ? "Sign-in link was invalid or expired. Try again." : null
  );

  const next = searchParams.get("next") ?? "/dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createSupabaseBrowser();

    if (mode === "signup") {
      const handle = username.trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(handle)) {
        setError("Usernames are 3–24 characters: letters, numbers and underscores only.");
        setBusy(false);
        return;
      }
      const { data: taken } = await supabase
        .from("public_profiles")
        .select("id")
        .ilike("username", handle)
        .maybeSingle();
      if (taken) {
        setError(`@${handle} is already taken — try another username.`);
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/api/auth/callback`,
          data: { username: handle, full_name: fullName.trim() },
        },
      });
      if (error) {
        setError(error.message);
      } else if (data.session) {
        router.push(next);
        router.refresh();
        return;
      } else {
        setNotice("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.push(next);
        router.refresh();
        return;
      }
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 md:px-10 py-5 border-b border-line">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <span className="rec-dot" aria-hidden />
          <span className="font-semibold tracking-tight text-lg">
            Reel<span className="text-primary">form</span>
          </span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <p className="mono-label">{mode === "signup" ? "NEW PRODUCTION" : "WELCOME BACK"}</p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight">
            {mode === "signup" ? "Start your first take" : "Back to the cutting room"}
          </h1>
          {mode === "signup" && (
            <p className="mt-2 text-muted">150 free credits — enough for a video and a full site build.</p>
          )}

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <label className="mono-label block mb-2" htmlFor="fullName">
                    FULL NAME
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    maxLength={80}
                    className="field"
                    placeholder="Ada Lovelace"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mono-label block mb-2" htmlFor="username">
                    USERNAME
                  </label>
                  <input
                    id="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    pattern="[A-Za-z0-9_]{3,24}"
                    title="3–24 characters: letters, numbers and underscores"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="field"
                    placeholder="ada_films"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <p className="mt-1.5 text-xs text-faint">
                    Your public handle — shown on everything you publish and share.
                  </p>
                </div>
              </>
            )}
            <div>
              <label className="mono-label block mb-2" htmlFor="email">
                EMAIL
              </label>
              <input
                id="email"
                type="email"
                required
                className="field"
                placeholder="you@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mono-label block mb-2" htmlFor="password">
                PASSWORD
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                className="field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}
            {notice && <p className="text-primary text-sm">{notice}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <button
            className="mt-6 text-sm text-muted hover:text-ink transition-colors"
            onClick={() => {
              setMode(mode === "signup" ? "signin" : "signup");
              setError(null);
              setNotice(null);
            }}
          >
            {mode === "signup" ? "Already have an account? Sign in" : "No account yet? Start free"}
          </button>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
