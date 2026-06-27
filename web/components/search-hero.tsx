import Link from "next/link";
import { SearchBar } from "./search-bar";
import { EXAMPLE_QUERIES } from "@/lib/constants";

/** The landing hero shown when no search is active: a calm, editorial invitation to search. */
export function SearchHero() {
  return (
    <section className="hero-wash relative overflow-hidden border-b border-line">
      <div className="relative mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <p className="fade-up font-mono text-xs uppercase tracking-[0.22em] text-ink-faint">
          Inspirationssök för kreatörer
        </p>
        <h1
          className="fade-up mt-5 font-display text-5xl font-bold leading-[1.04] tracking-tight text-ink sm:text-6xl"
          style={{ animationDelay: "60ms" }}
        >
          Hitta nästa idé —{" "}
          <span className="text-signal">innan den toppar.</span>
        </h1>
        <p
          className="fade-up mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg"
          style={{ animationDelay: "120ms" }}
        >
          Sök ett ämne och få de starkaste TikTok- och Reels-videorna — rankade
          efter Trend Score och hur långt de slår sina kreatörers snitt.
        </p>
        <div
          className="fade-up mx-auto mt-9 max-w-xl"
          style={{ animationDelay: "180ms" }}
        >
          <SearchBar size="lg" autoFocus />
        </div>
        <div
          className="fade-up mt-6 flex flex-wrap items-center justify-center gap-2"
          style={{ animationDelay: "240ms" }}
        >
          <span className="text-xs text-ink-faint">Prova</span>
          {EXAMPLE_QUERIES.map((q) => (
            <Link
              key={q}
              href={`/search?q=${encodeURIComponent(q)}`}
              className="rounded-full border border-line bg-white/70 px-3 py-1 text-sm text-ink-dim backdrop-blur-sm transition-colors hover:border-ink/20 hover:text-ink"
            >
              {q}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}