import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client (anon/publishable key). Used by the client-side auth forms
 * (login/register) to call supabase.auth.* and by any "use client" component that needs the
 * current session. RLS scopes every read/write to the signed-in user, so the anon key is safe
 * in the browser. Server-side reads of public content still use the service-role key elsewhere.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
