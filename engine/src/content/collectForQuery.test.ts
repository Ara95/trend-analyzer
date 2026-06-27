import { describe, it, expect } from 'vitest';
import { scrapeSearchBuckets, SEARCH_FRESHNESS_BUCKETS } from './collectForQuery.js';

describe('scrapeSearchBuckets', () => {
  it('scrapes all three freshness tiers, each with perBucket results and searchSection /video', async () => {
    const calls: any[] = [];
    const runActor = async (actorId: string, input: any) => {
      calls.push({ actorId, input });
      return [];
    };
    await scrapeSearchBuckets(runActor as any, 'clockworks/x', 'iphone tips', 15);

    expect(calls).toHaveLength(3);
    expect(calls.map((c) => c.input.videoSearchDateFilter)).toEqual([...SEARCH_FRESHNESS_BUCKETS]);
    for (const c of calls) {
      expect(c.actorId).toBe('clockworks/x');
      expect(c.input).toMatchObject({
        searchQueries: ['iphone tips'],
        searchSection: '/video',
        resultsPerPage: 15,
      });
      // default relevance sort — we must NOT pay for the videoSearchSorting charged filter.
      expect(c.input).not.toHaveProperty('videoSearchSorting');
    }
  });

  it('merges tiers and dedupes by id, keeping the freshest tier’s copy (first wins)', async () => {
    // day returns v1,v2; week returns v2,v3 (v2 overlaps); month returns v3,v4 (v3 overlaps).
    const byFilter: Record<string, any[]> = {
      PAST_24_HOURS: [{ id: 'v1', tier: 'day' }, { id: 'v2', tier: 'day' }],
      PAST_WEEK: [{ id: 'v2', tier: 'week' }, { id: 'v3', tier: 'week' }],
      PAST_MONTH: [{ id: 'v3', tier: 'month' }, { id: 'v4', tier: 'month' }],
    };
    const runActor = async (_actorId: string, input: any) => byFilter[input.videoSearchDateFilter];
    const out = await scrapeSearchBuckets(runActor as any, 'a', 'term', 15);

    expect(out.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4']); // 4 distinct, deduped
    expect(out.find((v) => v.id === 'v2')!.tier).toBe('day'); // freshest tier won
    expect(out.find((v) => v.id === 'v3')!.tier).toBe('week'); // first (week) won over month
  });

  it('tolerates empty / numeric-id results without dropping the run', async () => {
    const byFilter: Record<string, any[]> = {
      PAST_24_HOURS: [],
      PAST_WEEK: [{ id: 100 }], // numeric id → stringified
      PAST_MONTH: [{ noId: true }], // unusable → skipped
    };
    const runActor = async (_actorId: string, input: any) => byFilter[input.videoSearchDateFilter];
    const out = await scrapeSearchBuckets(runActor as any, 'a', 'term', 15);
    expect(out.map((v) => String(v.id))).toEqual(['100']);
  });
});
