import type {
  AccountSignals,
  ContentSnapshot,
  NormalizedTrend,
  Period,
  Platform,
} from '../adapters/contract.js';
import type { EngineConfig } from '../config/env.js';
import { ALL_INDUSTRIES, type Industry } from '../config/industries.js';
import { classify, type ClassifyDeps } from '../classify/classify.js';
import { harvestAuthors } from '../discovery/tiktok.js';
import { upsertTrends, type SupabaseLike } from '../store/trends.js';
import {
  upsertCreators,
  upsertVideos,
  insertVideoSnapshots,
  type CreatorRecord,
  type VideoRecord,
  type VideoSnapshotRecord,
} from '../store/videos.js';
import { rankContent, videoRecords, type ScoredContent } from './collect.js';
import { scoreTrends, virality } from './trendsignal.js';

// The platform-agnostic content-first trend core, shared by `collect` (TikTok) and
// `collect-instagram`. Takes already-scraped items in the flat shape rankContent reads (IG is
// pre-normalized to that shape) and a platform, then: rank per period → score the B+D trend signal
// over the FULL ranked scrape → slice the top → classify each → upsert. The cohort is the whole
// period (cross-industry "trending in Sweden"). All platform-specific logic (scrape + raw mapping)
// stays in the caller; this threads `platform` through classification, trend rows, and the upsert.
const COUNTRY = 'SE';
const DEFAULT_PERIODS: Period[] = ['day', 'week', 'month'];

export interface PipelineCtx {
  cfg: EngineConfig;
  supabase: unknown;
  classifyDeps: ClassifyDeps;
  periods?: Period[];
  nowMs?: number;
  // Language gate for rankContent. TikTok carries a real textLanguage (default ['sv','un']); IG uses
  // a synthetic 'sv'/'xx' from caption detection, so it passes ['sv'] (no 'un' = non-Swedish dropped).
  allowedLanguages?: string[];
  // On-demand search term (engine step 4): tags every indexed video with the query that scraped it,
  // folded into caption_tsv so the result surfaces for that term. Omit for the daily/mixed collect.
  sourceQuery?: string;
}

export async function runContentPipeline(
  platform: Platform,
  items: Record<string, any>[],
  ctx: PipelineCtx,
): Promise<NormalizedTrend[]> {
  const { cfg, supabase, classifyDeps } = ctx;
  const periods = ctx.periods ?? DEFAULT_PERIODS;
  const nowMs = ctx.nowMs ?? Date.now();
  const allowedLanguages = ctx.allowedLanguages ?? cfg.seAllowedLanguages;
  const format = platform === 'instagram' ? 'reel' : 'video';

  // Aggregate ALL captions per author across the full scrape (a richer classification signal than
  // one caption, which shrinks the 'all' share). harvestAuthors reads authorMeta.name + text, which
  // the IG normalizer also populates, so it works unchanged for both platforms.
  const authorCaptions = new Map(harvestAuthors(items, platform).map((c) => [c.handle, c.captions]));

  // Classify a video's industry once, cached by externalId (a video ranking in several period
  // windows is classified a single time). Reuses the account cache for known authors.
  const industryCache = new Map<string, Industry>();
  async function classifyVideo(c: ScoredContent): Promise<Industry> {
    const hit = industryCache.get(c.externalId);
    if (hit) return hit;
    const content: ContentSnapshot = {
      platform, accountId: '', externalId: c.externalId, format,
      views: c.views, likes: c.likes, comments: c.comments, shares: c.shares,
      capturedAt: new Date().toISOString(), caption: c.caption, handle: c.handle,
      hashtags: c.hashtags, thumbnail: c.thumbnail,
    };
    const captions = (c.handle ? authorCaptions.get(c.handle) : undefined) ?? (c.caption ? [c.caption] : []);
    const accountSignals: AccountSignals | undefined = c.handle
      ? { handle: c.handle, platform, recentCaptions: captions }
      : undefined;
    const result = await classify({ content, accountSignals, allowContentEscalation: true }, classifyDeps);
    const industry = result.primaryIndustry as Industry;
    industryCache.set(c.externalId, industry);
    return industry;
  }

  const allTrends: NormalizedTrend[] = [];
  for (const period of periods) {
    const ranked = rankContent(items, nowMs, period, { allowedLanguages });
    const signals = scoreTrends(ranked, {
      breakoutZ: cfg.trendBreakoutZ,
      minViralityViews: cfg.trendMinViralityViews,
    });
    const top = ranked.slice(0, cfg.contentTrendLimit); // signals[i] aligns: top is a prefix of ranked

    const breakdown: Record<string, number> = {};
    let breakoutCount = 0;
    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      const sig = signals[i];
      if (sig.isBreakout) breakoutCount++;
      const industry = await classifyVideo(c);
      breakdown[industry] = (breakdown[industry] ?? 0) + 1;
      allTrends.push({
        platform, format, label: c.externalId, country: COUNTRY,
        industry, period, views: c.views, velocityScore: c.score,
        sampleSize: 1, sampleWindowDays: Math.max(1, Math.round(c.ageDays)),
        trendScore: sig.trendScore, isBreakout: sig.isBreakout,
        metrics: {
          handle: c.handle, audioId: c.audioId, ageDays: c.ageDays, thumbnail: c.thumbnail,
          likes: c.likes, comments: c.comments, shares: c.shares, via: 'content-search',
          velocityZ: sig.velocityZ, viralityZ: sig.viralityZ, viralityEligible: sig.viralityEligible,
          shareRate: sig.virality.shareRate, commentRate: sig.virality.commentRate,
          engagementRate: sig.virality.engagementRate,
        },
      });
    }

    // Trending sounds: aggregate scores by audioId; a real sound trend needs >=2 videos sharing it.
    const byAudio = new Map<string, { score: number; n: number }>();
    for (const c of top) {
      if (!c.audioId) continue;
      const a = byAudio.get(c.audioId) ?? { score: 0, n: 0 };
      a.score += c.score; a.n += 1;
      byAudio.set(c.audioId, a);
    }
    let audioCount = 0;
    for (const [audioId, a] of byAudio) {
      if (a.n < 2) continue;
      audioCount++;
      allTrends.push({
        platform, format: 'audio', label: audioId, country: COUNTRY,
        industry: ALL_INDUSTRIES, period, velocityScore: a.score, sampleSize: a.n,
      });
    }
    const summary = Object.entries(breakdown).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
    console.log(`[collect:${platform}] ${period}: ${top.length} ${format} (${breakoutCount} breakout) + ${audioCount} audio; industries: ${summary}`);
  }

  // Persist the canonical video index (migration 0007) ONCE per run — period-independent, no language
  // gate (the index is the global corpus; period/language are query-time filters). This is the
  // searchable corpus that steps 2-3 (hybrid search, creator-relative outlier, AI hook analysis) read.
  const store = supabase as unknown as SupabaseLike;
  const indexed = videoRecords(items, nowMs, { maxAgeDays: cfg.indexMaxAgeDays });
  const capturedAt = new Date().toISOString();
  const creatorsByHandle = new Map<string, CreatorRecord>();
  const videoRows: VideoRecord[] = [];
  const snapshotRows: VideoSnapshotRecord[] = [];
  for (const c of indexed) {
    if (c.handle && !creatorsByHandle.has(c.handle)) {
      creatorsByHandle.set(c.handle, { platform, handle: c.handle, followerCount: c.followerCount });
    }
    videoRows.push({
      platform, platformVideoId: c.externalId, creatorHandle: c.handle,
      caption: c.caption, hashtags: c.hashtags, audioId: c.audioId,
      url: c.url, thumbnail: c.thumbnail, postedAt: c.postedAt,
      language: c.language, durationSeconds: c.durationSeconds,
      views: c.views, likes: c.likes, comments: c.comments, shares: c.shares,
      engagementRate: virality(c).engagementRate,
      sourceQuery: ctx.sourceQuery,
    });
    snapshotRows.push({
      platform, platformVideoId: c.externalId, capturedAt,
      views: c.views, likes: c.likes, comments: c.comments, shares: c.shares,
    });
  }
  await upsertCreators(store, [...creatorsByHandle.values()]);
  await upsertVideos(store, videoRows);
  await insertVideoSnapshots(store, snapshotRows);
  console.log(`[collect:${platform}] indexed ${videoRows.length} video(s), ${creatorsByHandle.size} creator(s)`);

  // Persist. Idempotent on (source, platform, country, industry, format, label, period).
  await upsertTrends(store, platform, allTrends);
  console.log(`[collect:${platform}] wrote ${allTrends.length} trend(s) across ${periods.join('/')}`);
  return allTrends;
}
