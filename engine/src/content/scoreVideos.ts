import { DEFAULT_WEIGHTS, type Weights } from '../engine/derive.js';
import { scoreTrends, type TrendItem } from './trendsignal.js';

// Scoring pass over the persistent video index (engine step 2a). Reads videos, derives each creator's
// baseline (median views), then scores every video on three axes — velocity (B) and virality (D)
// within its PLATFORM cohort, plus creator-relative outlier (O). No scraping: like `rescore`, this is
// pure compute over already-stored rows, so it's cheap to re-run and tune. Writes go through
// store/videos.ts; this module is the pure, testable core.

const MIN_AGE_DAYS = 0.5;

export interface VideoForScoring {
  id: string;
  platform: string;
  creatorHandle?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt?: string; // ISO
}

export interface VideoScore {
  id: string;
  trendScore: number;
  outlierRatio: number;
  isBreakout: boolean;
}

export interface CreatorBaseline {
  platform: string;
  handle: string;
  medianViews: number;
}

export interface ScoreVideosOptions {
  weights?: Weights;
  minAgeDays?: number;
  breakoutZ?: number;
  minViralityViews?: number;
  outlierFloor?: number;
  breakoutOutlierRatio?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Median views per creator, keyed platform → handle (a nested map sidesteps any delimiter ambiguity
// in handles). Computed over whatever videos are passed — typically a recent window.
export function computeBaselines(videos: VideoForScoring[]): CreatorBaseline[] {
  const byCreator = new Map<string, Map<string, number[]>>();
  for (const v of videos) {
    if (!v.creatorHandle) continue;
    let handles = byCreator.get(v.platform);
    if (!handles) {
      handles = new Map();
      byCreator.set(v.platform, handles);
    }
    const arr = handles.get(v.creatorHandle) ?? [];
    arr.push(v.views);
    handles.set(v.creatorHandle, arr);
  }
  const out: CreatorBaseline[] = [];
  for (const [platform, handles] of byCreator) {
    for (const [handle, views] of handles) {
      out.push({ platform, handle, medianViews: median(views) });
    }
  }
  return out;
}

// Score every video. B/D z-scores are measured within each PLATFORM cohort (TikTok and IG engagement
// scale differently); the O axis is creator-relative and platform-agnostic. Returns one VideoScore per
// input video (order not significant — keyed by id) plus the creator baselines used.
export function scoreVideoIndex(
  videos: VideoForScoring[],
  nowMs: number,
  opts: ScoreVideosOptions = {},
): { scores: VideoScore[]; baselines: CreatorBaseline[] } {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const minAge = opts.minAgeDays ?? MIN_AGE_DAYS;
  const baselines = computeBaselines(videos);

  // platform → handle → median, for the O-axis lookup.
  const baselineLookup = new Map<string, Map<string, number>>();
  for (const b of baselines) {
    let h = baselineLookup.get(b.platform);
    if (!h) {
      h = new Map();
      baselineLookup.set(b.platform, h);
    }
    h.set(b.handle, b.medianViews);
  }

  const byPlatform = new Map<string, VideoForScoring[]>();
  for (const v of videos) {
    const arr = byPlatform.get(v.platform) ?? [];
    arr.push(v);
    byPlatform.set(v.platform, arr);
  }

  const scores: VideoScore[] = [];
  for (const [platform, group] of byPlatform) {
    const handleMedians = baselineLookup.get(platform);
    const items: TrendItem[] = group.map((v) => {
      const createdMs = v.postedAt ? Date.parse(v.postedAt) : NaN;
      const ageDays = Number.isFinite(createdMs)
        ? Math.max((nowMs - createdMs) / 86_400_000, minAge)
        : minAge;
      const engagement =
        v.likes * weights.likes +
        v.comments * weights.comments +
        v.shares * weights.shares +
        v.views * weights.views;
      return {
        score: engagement / ageDays,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        shares: v.shares,
        creatorMedianViews: v.creatorHandle ? handleMedians?.get(v.creatorHandle) : undefined,
      };
    });
    const signals = scoreTrends(items, {
      breakoutZ: opts.breakoutZ,
      minViralityViews: opts.minViralityViews,
      outlierFloor: opts.outlierFloor,
      breakoutOutlierRatio: opts.breakoutOutlierRatio,
    });
    group.forEach((v, i) => {
      scores.push({
        id: v.id,
        trendScore: signals[i].trendScore,
        outlierRatio: signals[i].outlierRatio,
        isBreakout: signals[i].isBreakout,
      });
    });
  }
  return { scores, baselines };
}
