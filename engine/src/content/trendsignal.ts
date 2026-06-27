// Turning "popular" into "trend". High absolute engagement = popular; a *trend* is content that
// stands out RELATIVE TO ITS COHORT (B) and/or SPREADS unusually fast per viewer (D). Both are
// computable from a single scrape — no second snapshot — so this runs on the already-stored trends
// as well as on every future collect run. See README "How we decide a video is a trend".

export interface ViralityInput {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface ViralitySignals {
  // shares / views — how strongly viewers re-broadcast it; the clearest "spreading" signal.
  shareRate: number;
  // comments / views — conversation intensity.
  commentRate: number;
  // (likes + comments + shares) / views — overall reaction strength.
  engagementRate: number;
}

// D — virality ratios. Age-independent (unlike raw engagement), so a brand-new and an older video
// are directly comparable. views <= 0 → all zero (no denominator).
export function virality(m: ViralityInput): ViralitySignals {
  const v = m.views > 0 ? m.views : 0;
  if (v === 0) return { shareRate: 0, commentRate: 0, engagementRate: 0 };
  return {
    shareRate: m.shares / v,
    commentRate: m.comments / v,
    engagementRate: (m.likes + m.comments + m.shares) / v,
  };
}

export interface CohortStats {
  median: number;
  mad: number; // median absolute deviation
  n: number;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Robust cohort baseline: median + MAD, NOT mean + std. Engagement is heavy-tailed — a couple of
// mega-viral videos would inflate the mean and hide every other breakout. MAD is outlier-resistant.
export function cohortStats(values: number[]): CohortStats {
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  const absdev = sorted.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  return { median: med, mad: median(absdev), n: values.length };
}

// Modified z-score (Iglewicz–Hoaglin): 0.6745 * (x - median) / MAD. The standard robust measure of
// "how many deviations above its cohort"; >3.5 is the classic outlier cutoff. When MAD == 0 (a
// degenerate cohort where over half share one value) it falls back to a mean/std z using the raw
// values so a real outlier above a flat baseline still scores; 0 if there is no spread at all.
const MAD_TO_SD = 0.6745;
// Floor the spread at 10% of the median: in a near-uniform cohort the MAD can be tiny, which would
// turn a trivial difference into a giant z (a fake breakout). Treating spread below this as noise
// keeps z meaningful for tightly-clustered cohorts (common for engagement rates).
const REL_MAD_FLOOR = 0.1;
export function robustZ(x: number, stats: CohortStats, values: number[]): number {
  const effMad = Math.max(stats.mad, REL_MAD_FLOOR * Math.abs(stats.median));
  if (effMad > 0) return (MAD_TO_SD * (x - stats.median)) / effMad;
  if (values.length > 1) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    if (sd > 0) return (x - mean) / sd;
  }
  return 0; // cohort of one, or all identical: nothing to be an outlier against
}

export interface TrendItem extends ViralityInput {
  // velocity_score: recency-normalized weighted engagement (the "how fast" magnitude).
  score: number;
  // O — creator-relative outlier baseline: the median views across THIS creator's videos. A video far
  // above its own creator's median is a breakout *for that account* (Virlo's "12x above their average")
  // even at a modest absolute view count. Optional: when absent the outlier axis is skipped for this
  // item, so callers that don't track creators (collect, rescore) keep their exact prior behavior.
  creatorMedianViews?: number;
}

export interface TrendSignals {
  // Headline: the strongest robust z-score across all axes — "deviations above its cohort on its best
  // axis". This is the number the UI sorts by and the honest answer to "is this a trend".
  trendScore: number;
  velocityZ: number; // B: robust z of velocity within the cohort
  viralityZ: number; // D: robust z of engagementRate within the cohort
  viralityEligible: boolean; // whether views cleared minViralityViews (else viralityZ is ignored)
  // O: creator-relative outlier. ratio = views / max(creatorMedian, floor); outlierZ = robust z of
  // that ratio within the cohort. Eligible only when the creator's median is known.
  outlierRatio: number;
  outlierZ: number;
  outlierEligible: boolean;
  isBreakout: boolean; // trendScore >= breakoutZ, OR outlierRatio >= breakoutOutlierRatio
  virality: ViralitySignals;
}

export interface ScoreOptions {
  // Modified-z cutoff for "this is a trend, not just popular". Default 3.5 (classic outlier cutoff).
  breakoutZ?: number;
  // Minimum views for the virality (D) axis to count toward trendScore. Below this, engagement
  // ratios are a small-denominator artifact (a handful of friends, not a breakout), so only the
  // velocity axis decides. Early rise-from-tiny is a second-snapshot job (v2), not this.
  minViralityViews?: number;
  // Cohort to measure each item against. Defaults to `items` itself. Pass a deduped/full set when
  // the items being scored are a subset (e.g. re-scoring stored top-N) so the baseline is stable.
  baseline?: TrendItem[];
  // Floor under a creator's median views before dividing — stops a tiny-account median (e.g. 200
  // views) from inflating the ratio into a fake 60x outlier. Below the floor, the floor is used.
  outlierFloor?: number;
  // A video at or above this multiple of its creator's median is a breakout regardless of cohort z
  // (Virlo's "12x above their average"). Only applies to outlier-eligible items.
  breakoutOutlierRatio?: number;
}

export const DEFAULT_BREAKOUT_Z = 3.5;
export const DEFAULT_MIN_VIRALITY_VIEWS = 10_000;
export const DEFAULT_OUTLIER_FLOOR = 1_000;
export const DEFAULT_BREAKOUT_OUTLIER_RATIO = 12;

// O — creator-relative outlier ratio. views / max(creatorMedian, floor). 0 when the creator's median
// is unknown or non-positive (the item is then ineligible for the outlier axis).
export function outlierRatio(
  views: number,
  creatorMedianViews: number | undefined,
  floor: number,
): number {
  if (creatorMedianViews == null || creatorMedianViews <= 0) return 0;
  return views / Math.max(creatorMedianViews, floor);
}

function isOutlierEligible(it: TrendItem): boolean {
  return it.creatorMedianViews != null && it.creatorMedianViews > 0;
}

// Score content against a COHORT (same period — the caller groups). Each item gets a robust z for its
// velocity (B) and for its virality/engagementRate (D) measured against the cohort baseline;
// trendScore is the stronger of the two, so a video qualifies as a trend if it breaks out on EITHER
// raw spread speed or per-viewer spreading (the latter only once it has enough reach to be real).
// Order of the returned array matches `items`.
export function scoreTrends(items: TrendItem[], opts: ScoreOptions = {}): TrendSignals[] {
  const breakoutZ = opts.breakoutZ ?? DEFAULT_BREAKOUT_Z;
  const minViews = opts.minViralityViews ?? DEFAULT_MIN_VIRALITY_VIEWS;
  const outlierFloor = opts.outlierFloor ?? DEFAULT_OUTLIER_FLOOR;
  const breakoutOutlier = opts.breakoutOutlierRatio ?? DEFAULT_BREAKOUT_OUTLIER_RATIO;
  const baseline = opts.baseline ?? items;
  const baseVelocities = baseline.map((it) => it.score);
  const baseEngRates = baseline.map((it) => virality(it).engagementRate);
  // Outlier cohort: only the baseline items whose creator median is known define the ratio
  // distribution. When none do, this is empty → outlierZ is -Infinity for everyone and the axis is a
  // no-op, so callers that don't supply creatorMedianViews keep their exact prior trendScore.
  const baseOutliers = baseline
    .filter(isOutlierEligible)
    .map((it) => outlierRatio(it.views, it.creatorMedianViews, outlierFloor));
  const velStats = cohortStats(baseVelocities);
  const engStats = cohortStats(baseEngRates);
  const outStats = cohortStats(baseOutliers);
  return items.map((it) => {
    const vir = virality(it);
    const velocityZ = robustZ(it.score, velStats, baseVelocities);
    const viralityZ = robustZ(vir.engagementRate, engStats, baseEngRates);
    const viralityEligible = it.views >= minViews;
    const outlierEligible = isOutlierEligible(it);
    const oRatio = outlierEligible ? outlierRatio(it.views, it.creatorMedianViews, outlierFloor) : 0;
    const outlierZ = outlierEligible ? robustZ(oRatio, outStats, baseOutliers) : -Infinity;
    // velocityZ always counts (finite); the other axes only when eligible — so trendScore stays finite.
    const trendScore = Math.max(
      velocityZ,
      viralityEligible ? viralityZ : -Infinity,
      outlierEligible ? outlierZ : -Infinity,
    );
    // A trend either stands out from its cohort (z) OR is a hard multiple of its own creator's median.
    const isBreakout = trendScore >= breakoutZ || (outlierEligible && oRatio >= breakoutOutlier);
    return {
      trendScore,
      velocityZ,
      viralityZ,
      viralityEligible,
      outlierRatio: oRatio,
      outlierZ,
      outlierEligible,
      isBreakout,
      virality: vir,
    };
  });
}
