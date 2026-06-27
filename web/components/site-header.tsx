import Link from "next/link";
import { Search, Heart, LogOut } from "lucide-react";

/**
 * Shared top nav for the authenticated app (search + favoriter). Rendered by the (app) layout,
 * which already resolved the user. Signing out is a POST form to /auth/signout (a route handler
 * that clears the session cookies) — a plain form keeps it a server round-trip, no client JS.
 */
export function SiteHeader({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Link href="/search" className="font-display text-xl font-bold tracking-tight text-ink">
          Orbit<span className="ml-0.5 inline-block size-1.5 rounded-full bg-signal align-middle" aria-hidden />
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/search"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-dim transition-colors hover:bg-muted hover:text-ink"
          >
            <Search size={15} />
            <span className="hidden sm:inline">Sök</span>
          </Link>
          <Link
            href="/favoriter"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-dim transition-colors hover:bg-muted hover:text-ink"
          >
            <Heart size={15} />
            <span className="hidden sm:inline">Favoriter</span>
          </Link>

          <span aria-hidden className="mx-1 h-4 w-px bg-line" />

          {email && (
            <span className="hidden max-w-[14rem] truncate px-1 text-xs text-muted-foreground md:inline">
              {email}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-ink-dim transition-colors hover:bg-muted hover:text-ink"
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
