import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { connection } from "next/server";
import { parseSearchQuery, buildSearchHref, type SearchParams } from "@/lib/search-query";
import { searchVideos } from "@/lib/videos";
import type { VideoSearchQuery } from "@/lib/types";
import { ensureSearch } from "@/lib/searches";
import { getSavedKeys } from "@/lib/collections";
import { EXAMPLE_QUERIES } from "@/lib/constants";
import { SearchHero } from "@/components/search-hero";
import { SearchBar } from "@/components/search-bar";
import { SearchControls } from "@/components/search-controls";
import { SearchCollecting } from "@/components/search-collecting";
import { TrendBrief } from "@/components/trend-brief";
import { VideoCard } from "@/components/video-card";

export const metadata: Metadata = {
  title: "Orbit — sök trender",
  description:
    "Sök ett ämne och hitta de mest framgångsrika TikTok- och Reels-videorna, rankade efter Trend Score.",
};

function ResultsEmpty({ query }: { query: VideoSearchQuery }) {
  // An active outlier threshold is the most likely reason a non-empty search shows nothing: only videos
  // that beat their creator's own average ≥N× qualify, and on a search-driven corpus few creators have
  // enough indexed history for a meaningful baseline. Guide the user back rather than implying the topic
  // is dead. Link clears just the outlier filter, keeping the term + other filters.
  if (query.minOutlier > 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d5cfc2] bg-[#fbfaf6] px-6 py-16 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-[14px] bg-muted">
          <Search size={22} className="text-ink-faint" />
        </div>
        <p className="mt-4 font-display text-2xl font-bold tracking-[-0.02em] text-ink">
          Inga videor över {query.minOutlier}× snittet
        </p>
        <p className="mx-auto mt-2.5 max-w-md text-sm text-muted-foreground">
          Avvikelse-filtret visar bara videor som slår sin kreatörs egen snittnivå minst {query.minOutlier}×.
          Få kreatörer har tillräckligt med historik i indexet för det. Sänk tröskeln eller sortera på{" "}
          <span className="font-medium text-ink">Mest avvikande</span> istället.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={buildSearchHref(query, { minOutlier: 0 })}
            className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
          >
            Visa alla
          </Link>
          <Link
            href={buildSearchHref(query, { minOutlier: 0, sort: "outlier" })}
            className="rounded-full border border-line bg-white px-3 py-1 text-sm text-ink-dim transition-colors hover:border-ink/20 hover:text-ink"
          >
            Sortera på Mest avvikande
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-dashed border-[#d5cfc2] bg-[#fbfaf6] px-6 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-[14px] bg-muted">
        <Search size={22} className="text-ink-faint" />
      </div>
      <p className="mt-4 font-display text-2xl font-bold tracking-[-0.02em] text-ink">
        Inga träffar ännu
      </p>
      <p className="mx-auto mt-2.5 max-w-md text-sm text-muted-foreground">
        Vi hittade inga videor för{" "}
        <span className="font-medium text-ink">{query.q}</span>. Prova ett bredare ämne
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

  // Signal dynamic rendering: ensureSearch and getSavedKeys are uncached per-request data sources.
  // This replaces `force-dynamic` (incompatible with cacheComponents) while still allowing
  // "use cache" on searchVideos and embedQuery to cache results across requests.
  await connection();

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
          <SearchControls query={query} resultCount={items.length} />
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
            <ResultsEmpty query={query} />
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
