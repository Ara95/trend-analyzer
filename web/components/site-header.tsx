import { Suspense } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { OrbitMark } from "@/components/orbit-mark";
import { HeaderNav, HeaderNavFallback } from "@/components/header-nav";

/**
 * Shared top nav for the authenticated app (search + favoriter). Rendered by the (app) layout,
 * which already resolved the user. Signing out is a POST form to /auth/signout (a route handler
 * that clears the session cookies) — a plain form keeps it a server round-trip, no client JS.
 */
export function SiteHeader({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Link
          href="/search"
          className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-[-0.025em] text-ink"
        >
          <OrbitMark size={22} />
          Orbit
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Suspense fallback={<HeaderNavFallback />}>
            <HeaderNav />
          </Suspense>

          <span aria-hidden className="mx-1 h-4 w-px bg-line" />

          {email && (
            <span className="hidden max-w-[14rem] truncate px-1 text-xs text-muted-foreground md:inline">
              {email}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-ink-dim transition-colors hover:bg-muted hover:text-ink"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logga ut</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
