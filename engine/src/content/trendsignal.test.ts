import { describe, it, expect } from 'vitest';
import { virality, cohortStats, robustZ, scoreTrends, outlierRatio } from './trendsignal.js';

describe('virality (D)', () => {
  it('computes age-independent ratios from absolute engagement', () => {
    const v = virality({ views: 1000, likes: 100, comments: 50, shares: 30 });
    expect(v.shareRate).toBeCloseTo(0.03, 6);
    expect(v.commentRate).toBeCloseTo(0.05, 6);
    expect(v.engagementRate).toBeCloseTo(0.18, 6);
  });

  it('returns zero ratios when there are no views (no denominator)', () => {
    expect(virality({ views: 0, likes: 10, comments: 10, shares: 10 })).toEqual({
      shareRate: 0,
      commentRate: 0,
      engagementRate: 0,
    });
  });
});

describe('cohortStats + robustZ (B)', () => {
  it('uses median/MAD so a few mega-viral outliers do not move the baseline', () => {
    // four typical values + one 100x outlier. Median/MAD ignore the outlier; mean would not.
    const values = [10, 12, 11, 13, 1000];
    const s = cohortStats(values);
    expect(s.median).toBe(12);
    expect(s.n).toBe(5);
    // the outlier scores far above the cohort; the typical values score near zero
    expect(robustZ(1000, s, values)).toBeGreaterThan(3.5);
    expect(Math.abs(robustZ(11, s, values))).toBeLessThan(2);
  });

  it('returns 0 for a cohort with no spread (all identical or single item)', () => {
    expect(robustZ(5, cohortStats([5, 5, 5]), [5, 5, 5])).toBe(0);
    expect(robustZ(5, cohortStats([5]), [5])).toBe(0);
  });

  it('falls back to std-based z when both median and MAD are 0 but values vary', () => {
    const values = [0, 0, 0, 40]; // median 0 and MAD 0 → relative floor can't help → std fallback
    const z = robustZ(40, cohortStats(values), values);
    expect(z).toBeGreaterThan(1); // std fallback gives it a positive score rather than 0
  });

  it('floors tiny spread so a near-uniform cohort does not manufacture breakouts', () => {
    const values = [100, 100, 101, 100, 102]; // MAD ~0 but values barely differ
    const z = robustZ(102, cohortStats(values), values);
    expect(z).toBeLessThan(3.5); // 2% above median is not a trend, despite tiny MAD
  });
});

describe('scoreTrends (B + D combined)', () => {
  const cohort = [
    { score: 100, views: 10000, likes: 100, comments: 10, shares: 5 }, // typical
    { score: 110, views: 11000, likes: 110, comments: 11, shares: 6 }, // typical
    { score: 105, views: 10500, likes: 105, comments: 10, shares: 5 }, // typical
    { score: 120, views: 10800, likes: 120, comments: 12, shares: 6 }, // typical
    { score: 9000, views: 12000, likes: 9000, comments: 900, shares: 600 }, // velocity breakout
  ];

  it('flags the velocity outlier as a breakout and leaves typical content unflagged', () => {
    const out = scoreTrends(cohort, { breakoutZ: 3.5 });
    expect(out[4].isBreakout).toBe(true);
    expect(out[4].trendScore).toBeGreaterThan(3.5);
    expect(out.slice(0, 4).every((s) => !s.isBreakout)).toBe(true);
  });

  it('catches a virality breakout even when raw velocity is ordinary (with enough reach)', () => {
    // ordinary velocity, but huge engagement rate per view AND enough views to be real
    const withViral = [
      ...cohort.slice(0, 4),
      { score: 108, views: 50000, likes: 35000, comments: 15000, shares: 17000 },
    ];
    const out = scoreTrends(withViral, { breakoutZ: 3.5 });
    expect(out[4].viralityEligible).toBe(true);
    expect(out[4].viralityZ).toBeGreaterThan(out[4].velocityZ);
    expect(out[4].isBreakout).toBe(true);
  });

  it('ignores virality below the reach floor (small-denominator artifact)', () => {
    // identical engagement ratios to the case above, but only 598 views → not a real breakout
    const tinyViral = [
      ...cohort.slice(0, 4),
      { score: 108, views: 598, likes: 420, comments: 180, shares: 200 },
    ];
    const out = scoreTrends(tinyViral, { breakoutZ: 3.5, minViralityViews: 10_000 });
    expect(out[4].viralityEligible).toBe(false);
    expect(out[4].isBreakout).toBe(false); // velocity is ordinary, virality is ignored → not a trend
  });

  it('measures items against a provided baseline rather than themselves', () => {
    // score a single elite item against the full cohort baseline (what re-scoring a stored subset does)
    const elite = [cohort[4]];
    const out = scoreTrends(elite, { baseline: cohort });
    expect(out[0].velocityZ).toBeGreaterThan(3.5); // outlier vs the full cohort, not vs itself
  });

  it('preserves input order and reports both component z-scores', () => {
    const out = scoreTrends(cohort);
    expect(out).toHaveLength(cohort.length);
    expect(out[0]).toHaveProperty('velocityZ');
    expect(out[0]).toHaveProperty('viralityZ');
    // No creatorMedianViews supplied → outlier axis ineligible → trendScore unchanged from before.
    expect(out[0].outlierEligible).toBe(false);
    expect(out[0].trendScore).toBe(Math.max(out[0].velocityZ, out[0].viralityZ));
  });
});

describe('outlierRatio (O)', () => {
  it('divides views by the creator median, floored', () => {
    expect(outlierRatio(12_000, 1_000, 1_000)).toBe(12); // 12x its own median
    expect(outlierRatio(12_000, 200, 1_000)).toBe(12); // tiny median floored to 1000 → not 60x
    expect(outlierRatio(5_000, 5_000, 1_000)).toBe(1); // an ordinary post for this creator
  });

  it('returns 0 (ineligible) when the creator median is unknown or non-positive', () => {
    expect(outlierRatio(9_999, undefined, 1_000)).toBe(0);
    expect(outlierRatio(9_999, 0, 1_000)).toBe(0);
  });
});

describe('scoreTrends — creator-relative outlier axis', () => {
  // A creator whose median is ~5k views posts one video with 80k: ordinary cohort velocity, but a
  // massive breakout *for that account* (16x its own median). Median > floor so ratios read cleanly.
  const creatorPosts = [
    { score: 100, views: 4_500, likes: 120, comments: 12, shares: 6, creatorMedianViews: 5_000 },
    { score: 105, views: 5_200, likes: 130, comments: 13, shares: 6, creatorMedianViews: 5_000 },
    { score: 110, views: 5_000, likes: 140, comments: 12, shares: 7, creatorMedianViews: 5_000 },
    { score: 108, views: 5_500, likes: 135, comments: 14, shares: 7, creatorMedianViews: 5_000 },
    { score: 130, views: 80_000, likes: 300, comments: 25, shares: 15, creatorMedianViews: 5_000 }, // 16x
  ];

  it('flags a per-creator breakout that absolute views / cohort velocity would miss', () => {
    const out = scoreTrends(creatorPosts, { breakoutZ: 3.5, minViralityViews: 10_000 });
    expect(out[4].outlierEligible).toBe(true);
    expect(out[4].outlierRatio).toBeGreaterThanOrEqual(12);
    expect(out[4].isBreakout).toBe(true); // via the 12x hard trigger
    expect(out.slice(0, 4).every((s) => !s.isBreakout)).toBe(true);
  });

  it('does not flag an ordinary post for its creator', () => {
    const out = scoreTrends(creatorPosts);
    expect(out[2].outlierRatio).toBeCloseTo(1, 5); // exactly the median → ratio 1
    expect(out[2].isBreakout).toBe(false);
  });

  it('the 12x hard trigger catches per-creator breakouts the cohort z-score misses', () => {
    // Every video is 15x its own creator's median, so the ratio cohort is uniform → outlierZ ≈ 0 for
    // all (nothing stands out *relatively*). Yet each is a genuine breakout for its account; the hard
    // multiple is what flags them where the z-axis alone would not.
    const allHot = [0, 1, 2, 3, 4].map((i) => ({
      score: 100 + i, views: 15_000, likes: 50, comments: 5, shares: 2, creatorMedianViews: 1_000,
    }));
    const out = scoreTrends(allHot, { minViralityViews: 100_000 }); // views below floor → virality off
    expect(out.every((s) => Math.abs(s.outlierZ) < 1)).toBe(true); // z sees nothing unusual
    expect(out.every((s) => s.trendScore < 3.5)).toBe(true); // …so no z-driven breakout
    expect(out.every((s) => s.isBreakout)).toBe(true); // but all flagged via the 12x trigger
  });

  it('contributes nothing when creatorMedianViews is absent (back-compat)', () => {
    const out = scoreTrends(creatorPosts.map(({ creatorMedianViews, ...rest }) => rest));
    for (const s of out) {
      expect(s.outlierEligible).toBe(false);
      // trendScore is exactly the pre-outlier max of the velocity/virality axes.
      expect(s.trendScore).toBe(Math.max(s.velocityZ, s.viralityEligible ? s.viralityZ : -Infinity));
    }
  });
});
