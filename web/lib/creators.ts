import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import type { Platform, VideoResult } from "./types";

/**
 * Read a creator's profile + the videos we've indexed for them, for the /creator/[platform]/[handle]
 * surface. Server Components only — service-role key (public content read, no per-user scoping), like
 * lib/videos.ts.
 *
 * HONESTY CAVEAT: this index is search-driven and pruned at 30 days, so we typically hold only the
 * handful of a creator's videos that were incidentally scraped for some search term — NOT their full
 * profile (Virlo's profile analyzer scrapes the whole account on demand; that's separate engine work).
 * So aggregate stats (median views, engagement, best posting time) are computed only when we have enough
 * videos to be meaningful (MIN_FOR_STATS), and every figure is labelled "baserat på N videor".
 */

const SUPABASE_TIMEOUT_MS = 4000;
const MAX_AGE_DAYS = 30; // mirrors lib/videos.ts — never surface anything older than the index cap
const VIDEO_LIMIT = 60;
// Below this many indexed videos, rate/time aggregates are too noisy to show honestly.
const MIN_FOR_STATS = 4;

const VIDEO_COLS =
  "id, platform, platform_video_id, creator_handle, caption, hashtags, url, thumbnail_url, " +
  "posted_at, language, duration_seconds, views, likes, comments, shares, " +
  "engagement_rate, trend_score, outlier_ratio, is_breakout, views_per_day, views_growth_pct";

export interface CreatorStats {
  /** How many of this creator's videos we've indexed (the basis for every other figure). */
  videoCount: number;
  totalViews: number;
  /** Null until we have ≥ MIN_FOR_STATS videos. */
  medianViews: number | null;
  avgEngagement: number | null; // 0..1
  bestWindow: string | null; // e.g. "07–09"
  breakouts: number;
  maxOutlier: number | null;
}

export interface CreatorProfile {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  /** The creator's median views as computed by the engine's scoring pass (the outlier baseline). */
  baselineMedianViews: number | null;
  videos: VideoResult[];
  stats: CreatorStats;
}

function client(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sinceIso(): string {
  return new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString();
}

function mapRow(row: Record<string, unknown>): VideoResult {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    id: String(row.id),
    platform: row.platform as VideoResult["platform"],
    platformVideoId: String(row.platform_video_id),
    creatorHandle: (row.creator_handle as string) ?? undefined,
    caption: (row.caption as string) ?? undefined,
    hashtags: Array.isArray(row.hashtags) ? (row.hashtags as string[]) : [],
    url: (row.url as string) ?? undefined,
    thumbnail: (row.thumbnail_url as string) ?? undefined,
    postedAt: (row.posted_at as string) ?? undefined,
    language: (row.language as string) ?? undefined,
    durationSeconds: (row.duration_seconds as number) ?? undefined,
    views: n(row.views),
    likes: n(row.likes),
    comments: n(row.comments),
    shares: n(row.shares),
    engagementRate: row.engagement_rate == null ? undefined : Number(row.engagement_rate),
    trendScore: row.trend_score == null ? undefined : Number(row.trend_score),
    outlierRatio: row.outlier_ratio == null ? undefined : Number(row.outlier_ratio),
    isBreakout: Boolean(row.is_breakout),
    viewsPerDay: row.views_per_day == null ? undefined : Number(row.views_per_day),
    viewsGrowthPct: row.views_growth_pct == null ? undefined : Number(row.views_growth_pct),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Peak posting window by total views across the indexed videos — same approach as the trend brief.
// Returns null with fewer than MIN_FOR_STATS dated videos, so we never draw a "best time" from 2 points.
function bestWindow(videos: VideoResult[]): string | null {
  const byHour = new Array<number>(24).fill(0);
  let dated = 0;
  for (const v of videos) {
    if (!v.postedAt) continue;
    const h = new Date(v.postedAt).getHours();
    if (Number.isNaN(h)) continue;
    byHour[h] += v.views || 1;
    dated++;
  }
  if (dated < MIN_FOR_STATS) return null;
  let peak = 0;
  for (let h = 1; h < 24; h++) if (byHour[h] > byHour[peak]) peak = h;
  return `${pad(peak)}–${pad((peak + 2) % 24)}`;
}

function computeStats(videos: VideoResult[]): CreatorStats {
  const videoCount = videos.length;
  const totalViews = videos.reduce((s, v) => s + v.views, 0);
  const breakouts = videos.filter((v) => v.isBreakout).length;
  const outliers = videos.map((v) => v.outlierRatio).filter((r): r is number => r != null);
  const maxOutlier = outliers.length ? Math.max(...outliers) : null;

  const enough = videoCount >= MIN_FOR_STATS;
  const rates = videos.map((v) => v.engagementRate).filter((r): r is number => r != null);
  return {
    videoCount,
    totalViews,
    medianViews: enough ? median(videos.map((v) => v.views)) : null,
    avgEngagement: enough && rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null,
    bestWindow: bestWindow(videos),
    breakouts,
    maxOutlier,
  };
}

/**
 * Resolve a creator's profile. Returns null only when both the creators row AND any indexed videos are
 * absent (i.e. we genuinely have nothing to show — the page then 404s). A creator with videos but no
 * `creators` row still resolves (display fields fall back to the handle).
 */
export async function getCreatorProfile(
  platform: Platform,
  handle: string,
): Promise<CreatorProfile | null> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 60, expire: 600 });
  const supabase = client();
  if (!supabase) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    const [creatorRes, videosRes] = await Promise.all([
      supabase
        .from("creators")
        .select("display_name, avatar_url, follower_count, baseline_views_median")
        .eq("platform", platform)
        .eq("handle", handle)
        .abortSignal(controller.signal)
        .maybeSingle(),
      supabase
        .from("videos")
        .select(VIDEO_COLS)
        .eq("platform", platform)
        .eq("creator_handle", handle)
        .gte("posted_at", sinceIso())
        .order("trend_score", { ascending: false, nullsFirst: false })
        .order("views", { ascending: false })
        .limit(VIDEO_LIMIT)
        .abortSignal(controller.signal),
    ]);

    const videos = (videosRes.data as Record<string, unknown>[] | null)?.map(mapRow) ?? [];
    const creator = creatorRes.data as Record<string, unknown> | null;
    if (!creator && videos.length === 0) return null;

    return {
      platform,
      handle,
      displayName: (creator?.display_name as string) ?? null,
      avatarUrl: (creator?.avatar_url as string) ?? null,
      followerCount: creator?.follower_count == null ? null : Number(creator.follower_count),
      baselineMedianViews:
        creator?.baseline_views_median == null ? null : Number(creator.baseline_views_median),
      videos,
      stats: computeStats(videos),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
