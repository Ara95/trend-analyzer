import type { Metadata } from "next";
import Link from "next/link";
import { parseSearchQuery, type SearchParams } from "@/lib/search-query";
import { searchVideos } from "@/lib/videos";
import { ensureSearch } from "@/lib/searches";
import { getSavedKeys } from "@/lib/collections";
import { EXAMPLE_QUERIES } from "@/lib/constants";
import { SearchHero } from "@/components/search-hero";
import { SearchBar } from "@/components/search-bar";
import { SearchFilters } from "@/components/search-filters";
import { SearchCollecting } from "@/components/search-collecting";
import { TrendBrief } from "@/components/trend-brief";
import { VideoCard } from "@/components/video-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orbit — sök trender",
  description:
    "Sök ett ämne och hitta de mest framgångsrika TikTok- och Reels-videorna, rankade efter Trend Score.",
};

function ResultsEmpty({ q }: { q: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-muted-surface/40 px-6 py-16 text-center">
      <p className="font-display text-3xl font-bold tracking-tight text-ink">Inga träffar ännu</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Vi hittade inga videor för{" "}
        <span className="font-medium text-ink">{q}</span>. Prova ett bredare ämne
        eller andra filter — eller fyll videoindexet genom att köra en insamling.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {EXAMPLE_QUERIES.slice(0, 4).map((s) => (
          <Link
            key={s}
            href={`/search?q=${encodeURIComponent(s)}`}
            className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseSearchQuery(await searchParams);

  // Landing — no search term yet. (The shared header comes from the (app) layout.)
  if (!query.q) {
    return <SearchHero />;
  }

  // Register the search (queues an on-demand scrape if this term is new or its 30-day cache expired),
  // read the index, and load which videos the user has already saved — all in parallel.
  const [state, { items }, savedKeys] = await Promise.all([
    ensureSearch(query.q),
    searchVideos(query),
    getSavedKeys(),
  ]);

  return (
    <>
      <div className="sticky top-[57px] z-30 border-b border-line bg-background/90 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl space-y-3 px-5 py-4 sm:px-8">
          <SearchBar query={query} size="sm" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchFilters query={query} />
            <p className="shrink-0 font-mono text-xs text-ink-faint">
              {items.length} resultat
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-sm text-ink-faint">Resultat för</span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{query.q}</h1>
        </div>

        {items.length === 0 ? (
          state.collecting ? (
            <SearchCollecting hasResults={false} />
          ) : (
            <ResultsEmpty q={query.q} />
          )
        ) : (
          <>
            {state.collecting && <SearchCollecting hasResults />}
            <TrendBrief q={query.q} items={items} />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((v, i) => (
                <VideoCard
                  key={v.id}
                  v={v}
                  rank={i + 1}
                  delay={Math.min(i * 30, 300)}
                  saved={savedKeys.has(`${v.platform}:${v.platformVideoId}`)}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
