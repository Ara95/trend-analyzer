import { describe, it, expect } from 'vitest';
import { isClassA, type SourceAdapter } from './contract.js';

const fakeA: SourceAdapter = {
  id: 'x', platform: 'tiktok', sourceClass: 'trend-feed',
  fetchTrends: async () => [], fetchSnapshots: async () => [],
};
const fakeB: SourceAdapter = {
  id: 'y', platform: 'instagram', sourceClass: 'raw-content',
  fetchTrends: async () => [], fetchSnapshots: async () => [],
};

describe('isClassA', () => {
  it('is true for trend-feed sources', () => expect(isClassA(fakeA)).toBe(true));
  it('is false for raw-content sources', () => expect(isClassA(fakeB)).toBe(false));
});
