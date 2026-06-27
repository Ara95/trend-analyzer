import 'dotenv/config'; // load .env before loadEnv() reads it
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
import { flattenReels, normalizeInstagramReels } from '../content/instagram.js';
import {
  createOpenAIContentClassifier,
  createOpenAIEmbedder,
  createOpenAITagger,
} from '../providers/openai.js';

// Content-first Swedish Instagram trends — the account-agnostic mirror of `npm run collect` (TikTok).
// Instagram has no geo proxy and no language field, so we scrape a KEYWORD CAPTION search actor with
// Swedish-distinct words and detect Swedish from the caption ourselves (content/instagram.ts). The
// reels are normalized onto the same flat shape and run through the SAME pipeline (content/pipeline.ts)
// with a 'sv'-only language gate. Catches untagged viral content (search matches caption text, not
// hashtags). Run: `npm run collect:instagram`. See memory: apify-instagram-analysis.

async function main(): Promise<void> {
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);
  const runActor = createApify(cfg.apifyToken);

  const embed = cfg.openaiApiKey ? createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel) : undefined;
  const tag = cfg.openaiApiKey ? createOpenAITagger(cfg.openaiApiKey, cfg.openaiTagModel) : undefined;
  // Content-first classifier (primary path): one multimodal gpt-4o-mini call per reel over
  // caption + hashtags + cover image. Reuses the vision-capable model.
  const classifyContent = cfg.openaiApiKey
    ? createOpenAIContentClassifier(cfg.openaiApiKey, cfg.openaiVisionModel)
    : undefined;
  if (!cfg.openaiApiKey) {
    console.log('[collect:instagram] OPENAI_API_KEY not set — trends will be stored country-level (industry "all")');
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

  // 1. Scrape each Swedish-distinct keyword. The actor ranks globally with no geo, so the caption
  // language gate (downstream) is what makes the result Swedish — keep queries Swedish-distinct.
  // Tag each reel with the Swedish-distinct query it surfaced under so the normalizer can credit that
  // query word as Swedish evidence (recovers single-word captions like "Träning 💪"). Flatten per
  // batch because the tag must land on the inner reels, not the actor's container object.
  const reels: Record<string, any>[] = [];
  for (const query of cfg.igSearchQueries) {
    const batch = (await runActor(cfg.igSearchActorId, {
      query,
      maxPages: cfg.igMaxPages,
    })) as Record<string, any>[];
    for (const reel of flattenReels(batch)) {
      reel.__searchQuery = query;
      reels.push(reel);
    }
  }
  const items = normalizeInstagramReels(reels);
  const sv = items.filter((it) => it.textLanguage === 'sv').length;
  const un = items.filter((it) => it.textLanguage === 'un').length;
  const kept = sv + un;
  console.log(
    `[collect:instagram] search (${cfg.igSearchQueries.join(', ')}): ${reels.length} reels -> ${sv} Swedish + ${un} undetermined = ${kept} kept (${reels.length ? Math.round((100 * kept) / reels.length) : 0}% yield)`,
  );

  // 2. Rank, score, classify, persist — shared core. Gate keeps 'sv' + 'un': captions that read as
  // another language are 'xx' and dropped, but wordless (emoji/hashtag-only) reels are 'un' and kept
  // — a wordless caption is no evidence the reel is foreign, and it surfaced under a Swedish query.
  await runContentPipeline('instagram', items, {
    cfg,
    supabase,
    classifyDeps,
    allowedLanguages: ['sv', 'un'],
  });
}

main().catch((err) => {
  console.error('[collect:instagram] failed:', err);
  process.exitCode = 1;
});
