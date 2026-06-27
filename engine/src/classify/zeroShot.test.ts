import { describe, it, expect } from 'vitest';
import { cosineSimilarity, zeroShotLabels } from './zeroShot.js';
import type { IndustryVector } from '../adapters/contract.js';
import { REAL_INDUSTRIES } from '../config/industries.js';

const DIM = REAL_INDUSTRIES.length;
function oneHot(i: number): number[] {
  const v = new Array(DIM).fill(0);
  v[i] = 1;
  return v;
}
const industryVectors: IndustryVector[] = REAL_INDUSTRIES.map((industry, i) => ({
  industry,
  embedding: oneHot(i),
}));
const FOOD_INDEX = REAL_INDUSTRIES.indexOf('food');

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 when either vector is zero-length', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('zeroShotLabels', () => {
  it('concentrates confidence on the aligned industry', () => {
    const labels = zeroShotLabels(oneHot(FOOD_INDEX), industryVectors, { floor: 0.15 });
    expect(labels[0].industry).toBe('food');
    expect(labels[0].confidence).toBeGreaterThan(0.9);
    // The off-target industries fall below the floor and are dropped.
    expect(labels).toHaveLength(1);
  });

  it('returns a spread of low-confidence labels for an ambiguous (uniform) vector', () => {
    // Uniform query → all industries equally (un)likely: confidence ≈ 1/DIM each. Use a low floor so
    // the spread is observable regardless of how many categories exist (with the default 0.15 floor
    // and many categories, 1/DIM < floor, so an ambiguous item correctly yields no confident label).
    const labels = zeroShotLabels(new Array(DIM).fill(1), industryVectors, { floor: 0.01 });
    expect(labels.length).toBe(DIM);
    for (const l of labels) expect(l.confidence).toBeLessThan(0.7);
  });

  it('yields no confident label for an ambiguous vector once categories outnumber the floor', () => {
    // With 17 categories and the production floor, a uniform/ambiguous item drops to nothing here and
    // routes onward (LLM tagger / "all") instead of being forced into a bucket.
    const labels = zeroShotLabels(new Array(DIM).fill(1), industryVectors, { floor: 0.15 });
    if (DIM > 6) expect(labels).toHaveLength(0);
  });

  it('returns [] when there are no industry vectors', () => {
    expect(zeroShotLabels(oneHot(0), [], { floor: 0.15 })).toEqual([]);
  });
});
