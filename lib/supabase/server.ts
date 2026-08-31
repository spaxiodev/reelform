import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Request-scoped Supabase client for Server Components and Route Handlers.
// Uses the anon key + the user's auth cookies, so RLS applies.
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component, safe to ignore when
            // middleware is refreshing sessions.
          }
        },
      },
    }
  );
}
