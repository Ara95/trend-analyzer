import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SearchSort, VideoResult, VideoSearchQuery, VideoSearchResult } from "./types";
import { embedQuery } from "./embed";

/**
 * Read access to the persistent video index (engine migration 0007) for the Orbit search surface.
 * Server Components only — service-role key (public content read, no per-user scoping).
 *
 * Three paths:
 *  - browse (no query): plain filter + the user's chosen sort.
 *  - hybrid (query present): embed the query and call the search_videos RRF RPC (FTS + vector).
 *  - lexical (fallback): websearch FTS over caption_tsv, used when there is no embedding (no OpenAI
 *    key) or the RPC is unavailable (e.g. migration 0008 not applied yet). So search degrades
 *    gracefully instead of breaking.
 */

const SUPABASE_TIMEOUT_MS = 4000;
const RESULT_LIMIT = 60;
// Hard freshness ceiling: search never shows anything older than this, regardless of the period filter
// (matches the engine's INDEX_MAX_AGE_DAYS so the cap holds end to end). "all" period = exactly this.
const MAX_AGE_DAYS = 30;
const PERIOD_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

function client(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Always returns a cutoff: a chosen period narrows the window, but it can never exceed MAX_AGE_DAYS, and
// "all" (no period) resolves to MAX_AGE_DAYS rather than unbounded. So every read path is age-capped.
function sinceFor(period: string): string {
  const days = Math.min(PERIOD_DAYS[period] ?? MAX_AGE_DAYS, MAX_AGE_DAYS);
  return new Date(Date.now() - days * 86_400_000).toISOString();
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
  };
}

// Apply the user's sort to a videos query. The raw-metric sorts (views/likes/comments/shares) order by
// the absolute column; "engagement" by the computed rate; "recent" newest-first; "trend" (the default /
// relevance sort) by trend_score with a views tiebreaker. nullsFirst:false keeps un-scored / undated
// rows at the bottom. Generic over any builder whose .order() returns itself (Postgrest does), so it
// chains onto a filter or a text-search builder identically.
interface Sortable<T> {
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): T;
}
function applySort<T extends Sortable<T>>(q: T, sort: SearchSort): T {
  switch (sort) {
    case "views":
      return q.order("views", { ascending: false });
    case "likes":
      return q.order("likes", { ascending: false });
    case "comments":
      return q.order("comments", { ascending: false });
    case "shares":
      return q.order("shares", { ascending: false });
    case "engagement":
      return q.order("engagement_rate", { ascending: false, nullsFirst: false });
    case "recent":
      return q.order("posted_at", { ascending: false, nullsFirst: false });
    default:
      return q
        .order("trend_score", { ascending: false, nullsFirst: false })
        .order("views", { ascending: false });
  }
}

// Browse — no query text. Honors the sort control (trend_score is null until engine step 2 fills it,
// so the default keeps a views tiebreaker).
async function browse(
  supabase: SupabaseClient,
  query: VideoSearchQuery,
  signal: AbortSignal,
): Promise<VideoResult[]> {
  let q = supabase.from("videos").select("*").abortSignal(signal);
  if (query.platform !== "all") q = q.eq("platform", query.platform);
  if (query.language !== "all") q = q.eq("language", query.language);
  q = q.gte("posted_at", sinceFor(query.period)); // always age-capped (see sinceFor)

  const { data, error } = await applySort(q, query.sort).limit(RESULT_LIMIT);
  if (error || !data) return [];
  return data.map(mapRow);
}

// Lexical FTS — query present, ordered by the chosen sort (defaults to trend_score). Serves two roles:
// the graceful fallback when there's no embedding, AND the path for any explicit metric sort, since
// "most-liked videos for X" wants the term's whole matching set ordered by the metric, not an RRF
// relevance blend. source_query is folded into caption_tsv (migration 0009), so the FTS filter matches
// every video scraped for the term — full recall for on-demand searches without the vector pass.
async function lexical(
  supabase: SupabaseClient,
  query: VideoSearchQuery,
  signal: AbortSignal,
): Promise<VideoResult[]> {
  let q = supabase
    .from("videos")
    .select("*")
    .abortSignal(signal)
    .textSearch("caption_tsv", query.q, { type: "websearch", config: "simple" });
  if (query.platform !== "all") q = q.eq("platform", query.platform);
  if (query.language !== "all") q = q.eq("language", query.language);
  q = q.gte("posted_at", sinceFor(query.period)); // always age-capped (see sinceFor)

  const { data, error } = await applySort(q, query.sort).limit(RESULT_LIMIT);
  if (error || !data) return [];
  return data.map(mapRow);
}

// Hybrid — embed the query and let the RRF RPC blend FTS + vector. Falls back to lexical on any miss.
async function hybrid(
  supabase: SupabaseClient,
  query: VideoSearchQuery,
  signal: AbortSignal,
): Promise<VideoResult[]> {
  const embedding = await embedQuery(query.q);
  if (!embedding) return lexical(supabase, query, signal);

  const { data, error } = await supabase
    .rpc("search_videos", {
      q: query.q,
      q_embedding: `[${embedding.join(",")}]`,
      filter_platform: query.platform === "all" ? null : query.platform,
      filter_language: query.language === "all" ? null : query.language,
      since: sinceFor(query.period),
      max_results: RESULT_LIMIT,
    })
    .abortSignal(signal);
  if (error || !data) return lexical(supabase, query, signal);
  return (data as Record<string, unknown>[]).map(mapRow);
}

export async function searchVideos(query: VideoSearchQuery): Promise<VideoSearchResult> {
  const supabase = client();
  if (!supabase) return { items: [], query, empty: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  try {
    // With a query: "trend" means relevance → hybrid RRF (FTS + vector). Any explicit metric sort
    // wants the term's matches ordered by that metric, so take the lexical path (FTS + ORDER BY metric)
    // rather than the relevance blend. No query: browse the whole index by the chosen sort.
    const items = query.q
      ? query.sort === "trend"
        ? await hybrid(supabase, query, controller.signal)
        : await lexical(supabase, query, controller.signal)
      : await browse(supabase, query, controller.signal);
    return { items, query, empty: items.length === 0 };
  } catch {
    return { items: [], query, empty: true };
  } finally {
    clearTimeout(timer);
  }
}
