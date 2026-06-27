import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";

/**
 * Authenticated shell for the app surfaces (search + favoriter). The middleware already gates
 * access, but we re-check with getUser() here (revalidated, not the spoofable cookie) as the
 * source of truth for the header + a defense-in-depth redirect. Renders the shared SiteHeader.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader email={user.email} />
      {children}
    </div>
  );
}
