import 'dotenv/config'; // load .env before loadEnv() reads it
import type { AccountSignals, ContentSnapshot } from '../adapters/contract.js';
import { loadEnv } from '../config/env.js';
import { ALL_INDUSTRIES } from '../config/industries.js';
import { createSupabase } from '../store/supabase.js';
import { createApify } from '../store/apify.js';
import {
  getAccountClassification,
  loadIndustryVectors,
  upsertAccountClassification,
} from '../store/classification.js';
import {
  listExistingHandles,
  upsertDiscoveredAccounts,
  type DiscoveredAccountRow,
} from '../store/accounts.js';
import { classify, type ClassifyDeps } from '../classify/classify.js';
import { harvestAuthors } from '../discovery/tiktok.js';
import { createOpenAIEmbedder, createOpenAITagger } from '../providers/openai.js';

// Automatic account discovery (TikTok, Sweden). Scrapes Swedish hashtag seeds, harvests the
// authors, classifies each unseen author's industry from their captions, and persists the ones we
// could confidently bucket as discovered accounts. The regular worker then tracks them like any
// other panel account. Run: `npm run discover`.
async function main(): Promise<void> {
  const cfg = loadEnv();
  if (!cfg.openaiApiKey) {
    // derive() slices trends by accounts.industry, so an unclassified ('all') account is useless.
    // Classification needs the embedder/tagger — without a key, discovery cannot attribute industry.
    throw new Error('OPENAI_API_KEY is required for discovery (industry attribution).');
  }
  const supabase = createSupabase(cfg);
  const runActor = createApify(cfg.apifyToken);
  const embed = createOpenAIEmbedder(cfg.openaiApiKey, cfg.openaiEmbedModel);
  const tag = createOpenAITagger(cfg.openaiApiKey, cfg.openaiTagModel);

  const classifyDeps: ClassifyDeps = {
    getCachedClassification: (p, k) => getAccountClassification(supabase as any, p, k),
    putCachedClassification: (row) => upsertAccountClassification(supabase as any, row),
    loadIndustryVectors: () => loadIndustryVectors(supabase as any),
    embed,
    tag,
    cfg: {
      confidenceThreshold: cfg.classification.confidenceThreshold,
      similarityFloor: cfg.classification.similarityFloor,
      cacheMaxAgeDays: cfg.classification.cacheMaxAgeDays,
    },
  };

  // 1. Scrape every Swedish hashtag seed into one pool of videos.
  const items: Record<string, any>[] = [];
  for (const hashtag of cfg.discoveryHashtags) {
    const batch = (await runActor(cfg.tiktokActorId, {
      hashtags: [hashtag],
      resultsPerPage: cfg.discoveryResultsPerHashtag,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    })) as Record<string, any>[];
    console.log(`[discover] #${hashtag}: ${batch.length} videos`);
    items.push(...batch);
  }

  // 2. Harvest unique authors, drop ones we already track.
  const existing = await listExistingHandles(supabase as any, 'tiktok');
  const candidates = harvestAuthors(items, 'tiktok').filter((c) => !existing.has(c.handle));
  console.log(`[discover] ${candidates.length} new candidate accounts (after skipping known)`);

  // 3. Classify each candidate's industry from its captions; keep the confidently-bucketed ones.
  const threshold = cfg.classification.confidenceThreshold;
  const kept: DiscoveredAccountRow[] = [];
  const breakdown: Record<string, number> = {};
  let uncertain = 0;
  for (const cand of candidates) {
    const content: ContentSnapshot = {
      platform: 'tiktok',
      accountId: '',
      externalId: '',
      format: 'video',
      views: 0, likes: 0, comments: 0, shares: 0,
      capturedAt: new Date().toISOString(),
      handle: cand.handle,
      caption: cand.captions[0],
    };
    const accountSignals: AccountSignals = {
      handle: cand.handle,
      platform: 'tiktok',
      recentCaptions: cand.captions,
    };
    const result = await classify({ content, accountSignals, allowContentEscalation: false }, classifyDeps);
    const top = result.labels[0];
    if (result.primaryIndustry !== ALL_INDUSTRIES && top && top.confidence >= threshold) {
      kept.push({ handle: cand.handle, platform: 'tiktok', industry: result.primaryIndustry, country: 'SE' });
      breakdown[result.primaryIndustry] = (breakdown[result.primaryIndustry] ?? 0) + 1;
    } else {
      uncertain++;
    }
  }

  // 4. Persist the confident ones.
  const written = await upsertDiscoveredAccounts(supabase as any, kept);
  const summary = Object.entries(breakdown).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  console.log(
    `[discover] persisted ${written} discovered account(s): ${summary}; dropped ${uncertain} as uncertain`,
  );
}

main().catch((err) => {
  console.error('[discover] failed:', err);
  process.exitCode = 1;
});
