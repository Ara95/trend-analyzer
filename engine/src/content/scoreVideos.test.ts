import { describe, it, expect } from 'vitest';
import { computeBaselines, scoreVideoIndex, type VideoForScoring } from './scoreVideos.js';

const NOW = Date.parse('2026-06-22T00:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('computeBaselines', () => {
  it('takes the median views per creator, per platform', () => {
    const vids: VideoForScoring[] = [
      { id: '1', platform: 'tiktok', creatorHandle: 'a', views: 100, likes: 0, comments: 0, shares: 0 },
      { id: '2', platform: 'tiktok', creatorHandle: 'a', views: 300, likes: 0, comments: 0, shares: 0 },
      { id: '3', platform: 'tiktok', creatorHandle: 'a', views: 200, likes: 0, comments: 0, shares: 0 },
      { id: '4', platform: 'instagram', creatorHandle: 'a', views: 9000, likes: 0, comments: 0, shares: 0 },
    ];
    const out = computeBaselines(vids);
    expect(out.find((b) => b.platform === 'tiktok' && b.handle === 'a')!.medianViews).toBe(200);
    // same handle, different platform → a separate baseline (not pooled).
    expect(out.find((b) => b.platform === 'instagram' && b.handle === 'a')!.medianViews).toBe(9000);
  });

  it('ignores videos with no creator handle', () => {
    const out = computeBaselines([
      { id: '1', platform: 'tiktok', views: 100, likes: 0, comments: 0, shares: 0 },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('scoreVideoIndex', () => {
  // four ordinary posts around `base` views + one breakout, all by the same creator.
  function creatorRun(handle: string, base: number, breakoutViews: number): VideoForScoring[] {
    const post = (n: number, views: number, age: number): VideoForScoring => ({
      id: `${handle}-${n}`, platform: 'tiktok', creatorHandle: handle,
      views, likes: 100, comments: 2, shares: 1, postedAt: daysAgo(age),
    });
    return [
      post(1, base, 5),
      post(2, base * 1.1, 4),
      post(3, base * 0.9, 3),
      post(4, base, 2),
      { ...post(0, breakoutViews, 1), id: `${handle}-hit` },
    ];
  }

  it('returns one score per video and a baseline per creator', () => {
    const vids = creatorRun('a', 5000, 90_000);
    const { scores, baselines } = scoreVideoIndex(vids, NOW);
    expect(scores).toHaveLength(vids.length);
    expect(new Set(scores.map((s) => s.id)).size).toBe(vids.length);
    expect(baselines.find((b) => b.handle === 'a')!.medianViews).toBeGreaterThan(0);
  });

  it('flags a per-creator breakout via the outlier ratio', () => {
    const vids = creatorRun('a', 5000, 90_000); // 90k vs ~5k median ≈ 18x
    const { scores } = scoreVideoIndex(vids, NOW);
    const hit = scores.find((s) => s.id === 'a-hit')!;
    expect(hit.outlierRatio).toBeGreaterThanOrEqual(12);
    expect(hit.isBreakout).toBe(true);
    // an ordinary post for the same creator is not a breakout.
    expect(scores.find((s) => s.id === 'a-1')!.isBreakout).toBe(false);
  });

  it('handles a missing postedAt without producing NaN scores', () => {
    const { scores } = scoreVideoIndex(
      [{ id: '1', platform: 'tiktok', creatorHandle: 'a', views: 1000, likes: 10, comments: 1, shares: 1 }],
      NOW,
    );
    expect(Number.isFinite(scores[0].trendScore)).toBe(true);
  });
});
