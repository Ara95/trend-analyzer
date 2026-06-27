import type { ActorRunner } from '../adapters/contract.js';
import type { EngineConfig } from '../config/env.js';
import type { ClassifyDeps } from '../classify/classify.js';
import { runContentPipeline } from './pipeline.js';

// On-demand scrape of ONE arbitrary search term (engine step 4 / "search anything"). Reuses the whole
// content pipeline (rank → score-signal → write the video index), just parametrized on the user's term
// instead of the fixed daily query list. Global: no proxyCountryCode (the product is global now) and no
// language gate. Every indexed video is tagged with `term` (source_query) so it surfaces for that exact
// search even when TikTok's relevance returned captions that don't mention it. Returns items scraped.
export interface CollectForQueryDeps {
  runActor: ActorRunner;
  cfg: EngineConfig;
  supabase: unknown;
  // Pass a minimal (provider-less) classifyDeps for on-demand scrapes: the video index stores no
  // industry, so classification is pure cost here — the deterministic path labels everything 'all' for
  // free. Semantic embeddings are produced separately by the embed pass.
  classifyDeps: ClassifyDeps;
}

// Three age tiers scraped per term, freshest first. They are CUMULATIVE at the source (PAST_WEEK ⊇
// PAST_24_HOURS ⊇ ...), so the union deduped by id is fresh-weighted rather than three disjoint bands.
// Three calls (not one big page) is also how we exceed the actor's ~one-page search cap: each date
// filter is a distinct result set.
export const SEARCH_FRESHNESS_BUCKETS = ['PAST_24_HOURS', 'PAST_WEEK', 'PAST_MONTH'] as const;

// Scrape every freshness tier concurrently and merge into one deduped (by id) item list. perBucket
// results are requested from each tier — so up to perBucket * 3 distinct videos, weighted toward the
// freshest because the tiers overlap. Each tier uses searchSection '/video' (required by the date
// filter) and the actor's default MOST_RELEVANT sort (no second charged filter). First occurrence wins
// on dedup, and buckets run freshest→oldest, so a video's freshest qualifying tier is the one kept.
export async function scrapeSearchBuckets(
  runActor: ActorRunner,
  actorId: string,
  term: string,
  perBucket: number,
): Promise<Record<string, any>[]> {
  const runs = await Promise.all(
    SEARCH_FRESHNESS_BUCKETS.map(
      (videoSearchDateFilter) =>
        runActor(actorId, {
          searchQueries: [term],
          searchSection: '/video',
          videoSearchDateFilter,
          resultsPerPage: perBucket,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
        }) as Promise<Record<string, any>[]>,
    ),
  );

  const byId = new Map<string, Record<string, any>>();
  for (const items of runs) {
    for (const it of items ?? []) {
      const id = it?.id != null ? String(it.id) : undefined;
      if (id && !byId.has(id)) byId.set(id, it);
    }
  }
  return [...byId.values()];
}

export async function collectForQuery(term: string, deps: CollectForQueryDeps): Promise<number> {
  const { runActor, cfg, supabase, classifyDeps } = deps;

  // ($) Each tier is a charged date-filtered run — three per search vs one before, so ~3x the per-search
  // Apify cost. The point is a guaranteed freshness spread (today / this week / this month) and ~45
  // distinct videos, which a single capped page can't deliver.
  const items = await scrapeSearchBuckets(
    runActor,
    cfg.tiktokActorId,
    term,
    cfg.searchResultsPerBucket,
  );

  await runContentPipeline('tiktok', items, {
    cfg,
    supabase,
    classifyDeps,
    sourceQuery: term,
    allowedLanguages: [], // global: keep every language (it's a filter column, not an ingest gate)
  });

  return items.length;
}
