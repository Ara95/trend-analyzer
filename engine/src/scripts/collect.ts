import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { createApify } from '../store/apify.js';
import {
  getAccountClassification,
  getPanelAccountByHandle,
  loadIndustryVectors,
  upsertAccountClassification,
} from '../store/classification.js';
import { type ClassifyDeps } from '../classify/classify.js';
import { runContentPipeline } from '../content/pipeline.js';
import {
  createOpenAIContentClassifier,
  createOpenAIEmbedder,
  createOpenAITagger,
} from '../providers/openai.js';

// Content-first Swedish TikTok trends. One run, no account panel, no cold start: scrape Swedish
// content (free-text search — catches UN-hashtagged content — plus optional hashtags), then hand the
// raw items to the shared content pipeline (rank → trend-signal → classify → store). The UI filters
// the resulting trends by industry. Run: `npm run collect`. Instagram has its own entrypoint
// (`npm run collect:instagram`) because it needs a different actor + Swedish detection (see
// content/instagram.ts); both share content/pipeline.ts.
const COUNTRY = 'SE';

async function main(): Promise<void> {
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);
  const runActor = createApify(cfg.apifyToken);

  const embed = cfg.openaiApiKey ? createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel) : undefined;
  const tag = cfg.openaiApiKey ? createOpenAITagger(cfg.openaiApiKey, cfg.openaiTagModel) : undefined;
  // Content-first classifier (primary path): one multimodal gpt-4o-mini call per video over
  // caption + hashtags + cover image. Reuses the vision-capable model.
  const classifyContent = cfg.openaiApiKey
    ? createOpenAIContentClassifier(cfg.openaiApiKey, cfg.openaiVisionModel)
    : undefined;
  if (!cfg.openaiApiKey) {
    console.log('[collect] OPENAI_API_KEY not set — trends will be stored country-level (industry "all")');
  }
  const classifyDeps: ClassifyDeps = {
    getPanelAccount: (p, h) => getPanelAccountByHandle(supabase as any, p, h),
    getCachedClassification: (p, k) => getAccountClassification(supabase as any, p, k),
    putCachedClassification: (row) => upsertAccountClassification(supabase as any, row),
    loadIndustryVectors: () => loadIndustryVectors(supabase as any),
    classifyContent,
    embed,
    tag,
    cfg: {
      confidenceThreshold: cfg.classification.confidenceThreshold,
      similarityFloor: cfg.classification.similarityFloor,
      cacheMaxAgeDays: cfg.classification.cacheMaxAgeDays,
    },
  };

  // 1. Collect Swedish content: free-text search (catches un-hashtagged content). The hashtag pass
  // is off by default (COLLECT_INCLUDE_HASHTAGS) — it mostly re-scrapes the same videos at ~2x cost.
  const items: Record<string, any>[] = [];
  // proxyCountryCode makes clockworks/tiktok-scraper fetch TikTok's feed AS IF browsing from Sweden
  // (real geo, not a language guess). Unknown to other actors → harmlessly ignored if swapped.
  const base = {
    proxyCountryCode: COUNTRY,
    shouldDownloadVideos: false, shouldDownloadCovers: false,
    shouldDownloadSubtitles: false, shouldDownloadSlideshowImages: false,
  };
  if (cfg.seSearchQueries.length > 0) {
    const batch = (await runActor(cfg.tiktokActorId, {
      searchQueries: cfg.seSearchQueries,
      resultsPerPage: cfg.collectResultsPerPage,
      ...base,
    })) as Record<string, any>[];
    console.log(`[collect] search (${cfg.seSearchQueries.join(', ')}): ${batch.length} videos`);
    items.push(...batch);
  }
  if (cfg.collectIncludeHashtags && cfg.discoveryHashtags.length > 0) {
    const batch = (await runActor(cfg.tiktokActorId, {
      hashtags: cfg.discoveryHashtags,
      resultsPerPage: cfg.collectResultsPerPage,
      ...base,
    })) as Record<string, any>[];
    console.log(`[collect] hashtags (${cfg.discoveryHashtags.join(', ')}): ${batch.length} videos`);
    items.push(...batch);
  }

  // 2. Rank, score the trend signal, classify, and persist — shared with collect-instagram.
  await runContentPipeline('tiktok', items, { cfg, supabase, classifyDeps });
}

main().catch((err) => {
  console.error('[collect] failed:', err);
  process.exitCode = 1;
});
