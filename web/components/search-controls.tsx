"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SEARCH_OUTLIER_TIERS, SEARCH_PERIOD_TABS, SEARCH_SORTS } from "@/lib/constants";
import { buildSearchHref } from "@/lib/search-query";
import type { VideoSearchQuery } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SearchFilters } from "@/components/search-filters";

/**
 * The results-view control bar. Period and sort are pulled out of the Filter dropdown into
 * always-visible, one-tap controls:
 *  - a segmented switcher for the freshness window (Senaste dygnet / 7 dagar / 30 dagar), and
 *  - a row of sort pills (Trend Score, Visningar, Gillningar, …).
 * The remaining secondary filters (platform / language) stay in the SearchFilters dropdown.
 * Every control navigates via `buildSearchHref`, so the URL stays the single source of truth and
 * links remain shareable.
 *
 * Navigation is wrapped in startTransition so the current page stays visible (no loading skeleton
 * flash) while the server renders the new result set. useOptimistic gives instant visual feedback
 * on the clicked tab/pill before the server responds.
 */
export function SearchControls({
  query,
  resultCount,
}: {
  query: VideoSearchQuery;
  resultCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activePeriod, setActivePeriod] = useOptimistic<string, string>(
    query.period,
    (_, next) => next,
  );
  const [activeSort, setActiveSort] = useOptimistic<string, string>(
    query.sort,
    (_, next) => next,
  );
  const [activeOutlier, setActiveOutlier] = useOptimistic<number, number>(
    query.minOutlier,
    (_, next) => next,
  );

  const go = (patch: Partial<VideoSearchQuery>) => {
    startTransition(() => {
      if (patch.period !== undefined) setActivePeriod(patch.period);
      if (patch.sort !== undefined) setActiveSort(patch.sort);
      if (patch.minOutlier !== undefined) setActiveOutlier(patch.minOutlier);
      router.push(buildSearchHref(query, patch), { scroll: false });
    });
  };

  return (
    <div className={cn("space-y-3 transition-opacity", isPending && "opacity-60")}>
      {/* Primary row: period switcher · (filters + count pushed right) */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Tidsperiod"
          className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-muted-surface p-0.5"
        >
          {SEARCH_PERIOD_TABS.map((p) => {
            const active = activePeriod === p.value;
            const href = buildSearchHref(query, { period: p.value });
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => go({ period: p.value })}
                onMouseEnter={() => router.prefetch(href)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-card text-ink shadow-sm"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SearchFilters query={query} />
          <p className="shrink-0 font-mono text-xs text-ink-faint">
            {resultCount} resultat
          </p>
        </div>
      </div>

      {/* Sort row: each metric is its own pill, so "sortera på likes / kommentarer / …" is one tap. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          Sortera
        </span>
        {SEARCH_SORTS.map((s) => {
          const active = activeSort === s.value;
          const href = buildSearchHref(query, { sort: s.value });
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => go({ sort: s.value })}
              onMouseEnter={() => router.prefetch(href)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-signal bg-signal-soft text-signal"
                  : "border-line bg-card text-ink-dim hover:border-ink/20 hover:text-ink",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Outlier threshold: narrow to videos that beat their creator's own average by ≥N× — the "viral
          breakout" view (Virlo's outlier filter). "Alla" = no filter. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
          Avvikelse
        </span>
        {SEARCH_OUTLIER_TIERS.map((t) => {
          const active = activeOutlier === t.value;
          const href = buildSearchHref(query, { minOutlier: t.value });
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => go({ minOutlier: t.value })}
              onMouseEnter={() => router.prefetch(href)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-signal bg-signal-soft text-signal"
                  : "border-line bg-card text-ink-dim hover:border-ink/20 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
