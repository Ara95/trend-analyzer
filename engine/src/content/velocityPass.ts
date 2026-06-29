import type { SupabaseClient } from '@supabase/supabase-js';
import { computeVelocity, type VelocitySnapshot } from './velocity.js';
import { updateVideoVelocities, type VideoVelocityUpdate } from '../store/videos.js';

// Velocity pass over the video index (migration 0011). For every video with >= 2 snapshots in the
// window, compute the real per-day view growth from its two most recent snapshots and write it back.
// Pure compute over already-stored rows (no scraping); runs alongside the score pass. Videos with a
// single snapshot are left untouched (their velocity stays null) until a re-scrape adds a second.

export interface VelocityPassResult {
  // Videos that had >= 2 snapshots and got a velocity written.
  updated: number;
  // Videos seen in the window (denominator for "how much of the corpus has true velocity yet").
  candidates: number;
}

// Separator for composite (platform, platform_video_id) map keys. platform is 'tiktok'/'instagram'
// and ids are numeric/shortcodes, so this delimiter never appears inside either part: keys can't collide.
const KEY_SEP = '::';

type VideoRow = { id: string; platform: string; platform_video_id: string };
type SnapshotRow = {
  platform: string;
  platform_video_id: string;
  captured_at: string;
  views: number | null;
};

export async function runVelocityPass(
  supabase: SupabaseClient,
  windowDays = 60,
): Promise<VelocityPassResult> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  // The velocity columns live on `videos` (written by id), but the series lives on `video_snapshots`
  // (keyed by platform + platform_video_id). Read both within the window and join in memory; the corpus
  // is bounded (30-day prune), so this stays small.
  const [videosRes, snapsRes] = await Promise.all([
    supabase.from('videos').select('id,platform,platform_video_id').gte('posted_at', cutoff),
    supabase
      .from('video_snapshots')
      .select('platform,platform_video_id,captured_at,views')
      .gte('captured_at', cutoff),
  ]);
  if (videosRes.error) throw new Error(`read videos failed: ${videosRes.error.message}`);
  if (snapsRes.error) throw new Error(`read snapshots failed: ${snapsRes.error.message}`);

  const videos = (videosRes.data ?? []) as VideoRow[];
  if (videos.length === 0) return { updated: 0, candidates: 0 };

  const idByKey = new Map<string, string>();
  for (const v of videos) idByKey.set(`${v.platform}${KEY_SEP}${v.platform_video_id}`, String(v.id));

  // Group snapshots by (platform, video) for the videos we actually hold.
  const seriesByKey = new Map<string, VelocitySnapshot[]>();
  for (const s of (snapsRes.data ?? []) as SnapshotRow[]) {
    const key = `${s.platform}${KEY_SEP}${s.platform_video_id}`;
    if (!idByKey.has(key)) continue;
    const arr = seriesByKey.get(key) ?? [];
    arr.push({ capturedAt: s.captured_at, views: Number(s.views ?? 0) });
    seriesByKey.set(key, arr);
  }

  const updates: VideoVelocityUpdate[] = [];
  for (const [key, series] of seriesByKey) {
    const vel = computeVelocity(series);
    if (!vel) continue;
    const id = idByKey.get(key);
    if (!id) continue;
    updates.push({ id, viewsPerDay: vel.viewsPerDay, growthPct: vel.growthPct });
  }

  await updateVideoVelocities(supabase as never, updates);
  return { updated: updates.length, candidates: videos.length };
}
