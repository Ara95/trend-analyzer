import type { ActorRunner } from '../adapters/contract.js';
import type { EngineConfig } from '../config/env.js';
import type { ClassifyDeps } from '../classify/classify.js';
import { runContentPipeline } from './pipeline.js';
import { flattenReels, normalizeInstagramReels } from './instagram.js';

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

// On-demand Instagram scrape for ONE term. Mirrors the TikTok path but on the keyword-CAPTION search
// actor, which — unlike TikTok — takes NO date filter and NO geo (see content/instagram.ts): a single
// {query, maxPages} call ranked globally by relevance. So there are no freshness tiers here; the index's
// INDEX_MAX_AGE_DAYS prune is what bounds recency, and IG results skew older than TikTok's as a result
// (that asymmetry is why a date-aware IG actor is worth evaluating — see the README). Reels are flattened,
// normalized onto the shared flat shape, and folded into the SAME index tagged with `term`. The language
// gate is OFF (allowedLanguages: []) — on-demand search is global, not the Swedish cohort `collect:instagram`
// builds, so we keep every language and do NOT credit the query as Swedish evidence (no __searchQuery tag).
export async function collectInstagramForQuery(
  term: string,
  deps: CollectForQueryDeps,
): Promise<number> {
  const { runActor, cfg, supabase, classifyDeps } = deps;
  const batch = (await runActor(cfg.igSearchActorId, {
    query: term,
    maxPages: cfg.igMaxPages,
  })) as Record<string, any>[];
  const reels = flattenReels(batch ?? []);
  const items = normalizeInstagramReels(reels);

  // Visibility for "why is there no Instagram for my search": the current caption-search actor often
  // returns FEW or ZERO reels for a term (it's relevance-ranked and term-dependent), and the index's
  // 30-day cap then prunes most of whatever it did return. Logging actor-yield vs normalized count tells
  // "actor returned nothing" apart from "scraped but pruned at write time" (runContentPipeline logs the
  // final indexed count). A thrown actor error is logged separately by collectForQuery's catch.
  console.log(`[collectForQuery] instagram "${term}": ${reels.length} reels from actor → ${items.length} normalized`);

  await runContentPipeline('instagram', items, {
    cfg,
    supabase,
    classifyDeps,
    sourceQuery: term,
    allowedLanguages: [], // global: keep every language (filter column, not an ingest gate)
  });

  return items.length;
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

  // ($) Second platform, second charge. Instagram is folded into the same index so the platform-generic
  // web search surfaces it under this term. NON-FATAL by design: TikTok is the primary result set, so an
  // IG actor failure (rate limit, schema drift) must degrade to TikTok-only rather than blanking the
  // search. Sequential after TikTok to avoid concurrent upserts racing on the shared video tables.
  let igCount = 0;
  try {
    igCount = await collectInstagramForQuery(term, deps);
  } catch (err) {
    console.error(`[collectForQuery] instagram "${term}" failed:`, (err as Error).message ?? err);
  }

  return items.length + igCount;
}
