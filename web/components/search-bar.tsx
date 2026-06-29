import { Search } from "lucide-react";
import type { VideoSearchQuery } from "@/lib/types";

/**
 * The search input. A plain server-rendered GET <form action="/search"> — no client runtime: the
 * browser navigates to /search?q=… and the Server Component reads searchParams. Active filters are
 * carried as hidden inputs so submitting a new query doesn't drop them.
 */
export function SearchBar({
  query,
  size = "lg",
  autoFocus = false,
}: {
  query?: VideoSearchQuery;
  size?: "lg" | "sm";
  autoFocus?: boolean;
}) {
  const lg = size === "lg";
  return (
    <form
      action="/search"
      method="get"
      role="search"
      className={`ring-signal flex items-center gap-2 rounded-2xl border border-line bg-white transition-shadow ${
        lg ? "px-4 py-3 sm:px-5 sm:py-4" : "px-3.5 py-2.5"
      }`}
    >
      <Search size={lg ? 20 : 16} className="shrink-0 text-ink-faint" aria-hidden />
      <input
        name="q"
        defaultValue={query?.q ?? ""}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="gaming setup, AI-verktyg, träning hemma…"
        aria-label="Sök ämne eller nyckelord"
        className={`min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-faint focus:outline-none ${
          lg ? "text-base sm:text-lg" : "text-sm"
        }`}
      />
      {query?.platform && query.platform !== "all" && (
        <input type="hidden" name="platform" value={query.platform} />
      )}
      {query?.period && query.period !== "month" && (
        <input type="hidden" name="period" value={query.period} />
      )}
      {query?.language && query.language !== "all" && (
        <input type="hidden" name="lang" value={query.language} />
      )}
      {query?.sort && query.sort !== "trend" && (
        <input type="hidden" name="sort" value={query.sort} />
      )}
      <button
        type="submit"
        className={`shrink-0 rounded-xl bg-ink font-medium text-white transition-colors hover:bg-ink/90 ${
          lg ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
        }`}
      >
        Sök
      </button>
    </form>
  );
}