import type { SupabaseLike } from './trends.js';

// Coerce to a DB integer column. The actor returns some "count"/duration fields as fractional numbers
// (e.g. duration_seconds 93.3), which Postgres rejects for an integer column ("invalid input syntax for
// type integer"). Round at the write boundary so any fractional source value is accepted. Null/non-finite
// → null.
function int(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
}

// Persistence for the video index (migration 0007). Mirrors store/trends.ts: idempotent upserts keyed
// by a stable natural key, no id round-trips. Creators are linked to videos by (platform, handle);
// snapshots by (platform, platform_video_id) — so a single upsert/insert statement does each job.

export const VIDEOS_CONFLICT = 'platform,platform_video_id';
export const CREATORS_CONFLICT = 'platform,handle';
export const VIDEO_SNAPSHOTS_CONFLICT = 'platform,platform_video_id,captured_at';

// supabase-js `from(t).update(values).eq(col, val)` resolves to { error }. Modeled narrowly so the
// score-back pass (which updates one row per video by id) is unit-testable with a fake client.
export interface VideoUpdateClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
    };
  };
}

// supabase-js `from(t).delete({ count }).lt(col, val)` resolves to { error, count }. Modeled narrowly
// so the prune is unit-testable with a fake client, mirroring VideoUpdateClient.
export interface VideoDeleteClient {
  from(table: string): {
    delete(opts?: { count?: 'exact' | 'planned' | 'estimated' }): {
      lt(col: string, val: unknown): Promise<{ error: { message: string } | null; count: number | null }>;
    };
  };
}

export interface VideoScoreUpdate {
  id: string;
  trendScore: number;
  outlierRatio: number;
  isBreakout: boolean;
}

export interface CreatorBaselineUpdate {
  platform: string;
  handle: string;
  medianViews: number;
}

export interface VideoEmbeddingUpdate {
  id: string;
  embedding: number[];
}

export interface VideoVelocityUpdate {
  id: string;
  viewsPerDay: number;
  growthPct: number;
}

export interface CreatorRecord {
  platform: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
}

export interface VideoRecord {
  platform: string;
  platformVideoId: string;
  creatorHandle?: string;
  caption?: string;
  hashtags?: string[];
  audioId?: string;
  url?: string;
  thumbnail?: string;
  postedAt?: string; // ISO
  language?: string;
  durationSeconds?: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate?: number;
  // The on-demand search term that scraped this video (engine step 4). Folded into caption_tsv so the
  // video surfaces for that term. Undefined for the daily/mixed collect — then it's OMITTED from the
  // upsert so a re-scrape never clobbers a previously-set source_query to null.
  sourceQuery?: string;
}

export interface VideoSnapshotRecord {
  platform: string;
  platformVideoId: string;
  capturedAt: string; // ISO
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

// Upsert creators. Only the columns we know at ingest are written — baseline_views_median /
// baseline_updated_at (step 2) and first_seen_at are intentionally OMITTED so ON CONFLICT never
// clobbers them.
export async function upsertCreators(client: SupabaseLike, creators: CreatorRecord[]): Promise<void> {
  if (creators.length === 0) return;
  const rows = creators.map((c) => ({
    platform: c.platform,
    handle: c.handle,
    display_name: c.displayName ?? null,
    avatar_url: c.avatarUrl ?? null,
    follower_count: int(c.followerCount),
  }));
  const { error } = await client.from('creators').upsert(rows, { onConflict: CREATORS_CONFLICT });
  if (error) throw new Error(`upsertCreators failed: ${error.message}`);
}

// Upsert videos (latest metrics + content). trend_score / outlier_ratio / is_breakout / embedding /
// first_seen_at are OMITTED so re-ingest refreshes metrics without erasing step-2 scoring.
export async function upsertVideos(client: SupabaseLike, videos: VideoRecord[]): Promise<void> {
  if (videos.length === 0) return;
  const lastScrapedAt = new Date().toISOString();
  const rows = videos.map((v) => ({
    platform: v.platform,
    platform_video_id: v.platformVideoId,
    creator_handle: v.creatorHandle ?? null,
    caption: v.caption ?? null,
    hashtags: v.hashtags ?? null,
    audio_id: v.audioId ?? null,
    url: v.url ?? null,
    thumbnail_url: v.thumbnail ?? null,
    posted_at: v.postedAt ?? null,
    language: v.language ?? null,
    duration_seconds: int(v.durationSeconds),
    views: int(v.views) ?? 0,
    likes: int(v.likes) ?? 0,
    comments: int(v.comments) ?? 0,
    shares: int(v.shares) ?? 0,
    engagement_rate: v.engagementRate ?? null, // numeric column — keep the fractional rate as-is
    last_scraped_at: lastScrapedAt,
    // Include source_query ONLY when set (a single-term on-demand scrape) — omitting it on the daily
    // mixed collect preserves any term already attached. Keep this uniform across a batch (every row in
    // one run either has the key or not), since PostgREST bulk upsert requires matching keys.
    ...(v.sourceQuery !== undefined ? { source_query: v.sourceQuery } : {}),
  }));
  const { error } = await client.from('videos').upsert(rows, { onConflict: VIDEOS_CONFLICT });
  if (error) throw new Error(`upsertVideos failed: ${error.message}`);
}

// Append engagement snapshots. Upsert (not insert) so a same-timestamp re-run is idempotent rather
// than a primary-key violation; normal runs carry a fresh captured_at and never collide.
export async function insertVideoSnapshots(
  client: SupabaseLike,
  snapshots: VideoSnapshotRecord[],
): Promise<void> {
  if (snapshots.length === 0) return;
  const rows = snapshots.map((s) => ({
    platform: s.platform,
    platform_video_id: s.platformVideoId,
    captured_at: s.capturedAt,
    views: s.views,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
  }));
  const { error } = await client
    .from('video_snapshots')
    .upsert(rows, { onConflict: VIDEO_SNAPSHOTS_CONFLICT });
  if (error) throw new Error(`insertVideoSnapshots failed: ${error.message}`);
}

// Write the trend signal back onto the index (engine step 2a). One UPDATE per video by id — mirrors
// scripts/rescore.ts. trend_score/outlier_ratio/is_breakout are the only columns touched, so metrics
// and content set at ingest are untouched.
export async function updateVideoScores(
  client: VideoUpdateClient,
  scores: VideoScoreUpdate[],
): Promise<void> {
  for (const s of scores) {
    const { error } = await client
      .from('videos')
      .update({
        trend_score: s.trendScore,
        outlier_ratio: s.outlierRatio,
        is_breakout: s.isBreakout,
      })
      .eq('id', s.id);
    if (error) throw new Error(`updateVideoScores failed for ${s.id}: ${error.message}`);
  }
}

// Persist each creator's baseline median views (the O-axis input). Upserts ONLY the baseline columns,
// so follower_count / display_name set at ingest survive. bigint column → round.
export async function upsertCreatorBaselines(
  client: SupabaseLike,
  baselines: CreatorBaselineUpdate[],
): Promise<void> {
  if (baselines.length === 0) return;
  const updatedAt = new Date().toISOString();
  const rows = baselines.map((b) => ({
    platform: b.platform,
    handle: b.handle,
    baseline_views_median: Math.round(b.medianViews),
    baseline_updated_at: updatedAt,
  }));
  const { error } = await client.from('creators').upsert(rows, { onConflict: CREATORS_CONFLICT });
  if (error) throw new Error(`upsertCreatorBaselines failed: ${error.message}`);
}

// Drop videos posted more than maxAgeDays ago — the freshness ceiling enforced as an actual delete so
// the index stays bounded and never serves stale content (the read-cap is belt; this is suspenders, and
// it keeps the score pass fast as the corpus turns over). Rows with a null posted_at are left alone
// (NULL < cutoff is false) — the read-cap excludes them anyway. Returns the number deleted.
export async function pruneVideos(client: VideoDeleteClient, maxAgeDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
  const { error, count } = await client.from('videos').delete({ count: 'exact' }).lt('posted_at', cutoff);
  if (error) throw new Error(`pruneVideos failed: ${error.message}`);
  return count ?? 0;
}

// Write true view velocity onto the index (migration 0011). viewsPerDay / views_growth_pct are derived
// from a video's two most recent snapshots (content/velocity.ts); velocity_updated_at stamps the run.
// One UPDATE per video by id, mirroring updateVideoScores — only the velocity columns are touched, so
// metrics, content, and step-2 scoring set elsewhere are untouched.
export async function updateVideoVelocities(
  client: VideoUpdateClient,
  rows: VideoVelocityUpdate[],
): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (const r of rows) {
    const { error } = await client
      .from('videos')
      .update({
        views_per_day: r.viewsPerDay,
        views_growth_pct: r.growthPct,
        velocity_updated_at: updatedAt,
      })
      .eq('id', r.id);
    if (error) throw new Error(`updateVideoVelocities failed for ${r.id}: ${error.message}`);
  }
}

// Write caption embeddings onto the index (engine step 2b). The vector is sent as its TEXT literal
// ('[0.1,0.2,…]') — PostgREST casts text→vector reliably where a JSON array would not. One UPDATE per
// video by id; only the embedding column is touched.
export async function updateVideoEmbeddings(
  client: VideoUpdateClient,
  rows: VideoEmbeddingUpdate[],
): Promise<void> {
  for (const r of rows) {
    const { error } = await client
      .from('videos')
      .update({ embedding: `[${r.embedding.join(',')}]` })
      .eq('id', r.id);
    if (error) throw new Error(`updateVideoEmbeddings failed for ${r.id}: ${error.message}`);
  }
}
