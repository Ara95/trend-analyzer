import { describe, it, expect } from 'vitest';
import { computeVelocity, type VelocitySnapshot } from './velocity.js';

const snap = (capturedAt: string, views: number): VelocitySnapshot => ({ capturedAt, views });

describe('computeVelocity', () => {
  it('returns null with fewer than two snapshots', () => {
    expect(computeVelocity([])).toBeNull();
    expect(computeVelocity([snap('2026-06-20T00:00:00.000Z', 100)])).toBeNull();
  });

  it('computes views/day and growth % from the two most recent snapshots', () => {
    const v = computeVelocity([
      snap('2026-06-20T00:00:00.000Z', 1000),
      snap('2026-06-24T00:00:00.000Z', 5000), // +4000 over 4 days
    ]);
    expect(v).not.toBeNull();
    expect(v!.viewsPerDay).toBe(1000); // 4000 / 4
    expect(v!.growthPct).toBe(400); // 4000 / 1000 * 100
  });

  it('ignores older snapshots and is order-independent', () => {
    const v = computeVelocity([
      snap('2026-06-24T00:00:00.000Z', 5000),
      snap('2026-06-01T00:00:00.000Z', 10), // oldest — must be ignored
      snap('2026-06-22T00:00:00.000Z', 1000), // second-most-recent
    ]);
    // Uses 06-24 (5000) vs 06-22 (1000): +4000 over 2 days = 2000/day, +400%.
    expect(v!.viewsPerDay).toBe(2000);
    expect(v!.growthPct).toBe(400);
  });

  it('handles a declining view count (corrections / dedup) as negative velocity', () => {
    const v = computeVelocity([
      snap('2026-06-22T00:00:00.000Z', 2000),
      snap('2026-06-23T00:00:00.000Z', 1500),
    ]);
    expect(v!.viewsPerDay).toBe(-500);
    expect(v!.growthPct).toBe(-25);
  });

  it('returns null for a non-positive time delta (same instant)', () => {
    expect(
      computeVelocity([
        snap('2026-06-22T00:00:00.000Z', 1000),
        snap('2026-06-22T00:00:00.000Z', 2000),
      ]),
    ).toBeNull();
  });

  it('reports 0% growth (not Infinity) when the prior snapshot had zero views', () => {
    const v = computeVelocity([
      snap('2026-06-22T00:00:00.000Z', 0),
      snap('2026-06-23T00:00:00.000Z', 500),
    ]);
    expect(v!.viewsPerDay).toBe(500);
    expect(v!.growthPct).toBe(0);
  });
});
