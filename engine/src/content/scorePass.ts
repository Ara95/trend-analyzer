import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineConfig } from '../config/env.js';
import { scoreVideoIndex, type VideoForScoring } from './scoreVideos.js';
import { updateVideoScores, upsertCreatorBaselines } from '../store/videos.js';
import { runVelocityPass } from './velocityPass.js';

// Reusable scoring pass over the video index — shared by `npm run score:videos` and the on-demand
// search worker. No scraping: pure compute over stored rows, then write trend_score / outlier_ratio /
// is_breakout + creator baselines back, and (migration 0011) true view velocity for any video with >= 2
// snapshots. Returns a small summary for logging.
export interface ScorePassResult {
  scored: number;
  baselines: number;
  breakouts: number;
  topTrendScore: number;
  // Videos that had >= 2 snapshots and got a real views/day velocity written this pass.
  velocities: number;
}

type Row = {
  id: string;
  platform: string;
  creator_handle: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  posted_at: string | null;
};

export async function runScorePass(
  supabase: SupabaseClient,
  cfg: EngineConfig,
  windowDays = 60,
): Promise<ScorePassResult> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('videos')
    .select('id,platform,creator_handle,views,likes,comments,shares,posted_at')
    .gte('posted_at', cutoff);
  if (error) throw new Error(`read videos failed: ${error.message}`);

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return { scored: 0, baselines: 0, breakouts: 0, topTrendScore: 0, velocities: 0 };

  const videos: VideoForScoring[] = rows.map((r) => ({
    id: String(r.id),
    platform: String(r.platform),
    creatorHandle: r.creator_handle ?? undefined,
    views: Number(r.views ?? 0),
    likes: Number(r.likes ?? 0),
    comments: Number(r.comments ?? 0),
    shares: Number(r.shares ?? 0),
    postedAt: r.posted_at ?? undefined,
  }));

  const { scores, baselines } = scoreVideoIndex(videos, Date.now(), {
    breakoutZ: cfg.trendBreakoutZ,
    minViralityViews: cfg.trendMinViralityViews,
  });

  await upsertCreatorBaselines(supabase as never, baselines);
  await updateVideoScores(supabase as never, scores);

  // True view velocity from the snapshot series (migration 0011). Same window as scoring. Most videos
  // have a single snapshot until their term is re-scraped, so `updated` is small early and grows as the
  // series accumulates — that's expected.
  const velocity = await runVelocityPass(supabase, windowDays);

  return {
    scored: scores.length,
    baselines: baselines.length,
    breakouts: scores.filter((s) => s.isBreakout).length,
    topTrendScore: scores.map((s) => s.trendScore).sort((a, b) => b - a)[0] ?? 0,
    velocities: velocity.updated,
  };
}
