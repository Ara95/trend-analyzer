import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client bound to the request's cookies (anon key + the user's session JWT).
 * Use this in Server Components, Route Handlers and Server Actions for any PER-USER work
 * (auth checks, collections) — RLS applies via auth.uid(). Always read the user with
 * supabase.auth.getUser() (revalidates against the auth server), never getSession().
 *
 * cookies() is async in Next 15+. In a Server Component the cookie store is read-only, so setAll
 * can throw — that's fine, the middleware (lib/supabase/middleware.ts) is what refreshes the
 * session cookies on each request, so we swallow the write error here.
 */
export async function createClient() {
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
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component (read-only cookie store) — middleware handles refresh.
          }
        },
      },
    },
  );
}
