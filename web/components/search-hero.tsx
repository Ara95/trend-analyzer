import Link from "next/link";
import { SearchBar } from "./search-bar";
import { OrbitMotif } from "@/components/orbit-mark";
import { EXAMPLE_QUERIES } from "@/lib/constants";

/** The landing hero shown when no search is active: a calm, editorial invitation to search. */
export function SearchHero() {
  return (
    <section className="hero-wash relative overflow-hidden border-b border-line">
      {/* Faint orbit motif, upper-right — quiet brand atmosphere, never foreground. */}
      <OrbitMotif className="pointer-events-none absolute -right-20 -top-24 size-[26rem] opacity-50" />

      <div className="relative mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <p className="fade-up font-mono text-xs uppercase tracking-[0.24em] text-signal">
          Inspirationssök för kreatörer
        </p>
        <h1
          className="fade-up mt-5 font-display text-5xl font-bold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl"
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
          <SearchBar size="lg" autoFocus accent />
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
              className="rounded-full border border-line bg-white px-3.5 py-1.5 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
            >
              {q}
            </Link>
          ))}
        </div>
        {/* Mono assurance strip. Qualitative only — we don't surface a fabricated "N topics indexed"
            count here; wire a real count from the searches/videos index when one is cheap to fetch. */}
        <div
          className="fade-up mt-9 inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11px] text-ink-faint"
          style={{ animationDelay: "300ms" }}
        >
          <span>TikTok &amp; Reels</span>
          <span className="size-1 rounded-full bg-[#d8d0c2]" aria-hidden />
          <span>rankat efter Trend Score</span>
          <span className="size-1 rounded-full bg-[#d8d0c2]" aria-hidden />
          <span>uppdateras löpande</span>
        </div>
      </div>
    </section>
  );
}
