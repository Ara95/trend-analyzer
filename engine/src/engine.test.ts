import { describe, it, expect } from 'vitest';
import { runEngine, type EngineDeps } from './engine.js';
import type { NormalizedTrend, ContentSnapshot, SourceAdapter, PanelAccount } from './adapters/contract.js';

const account: PanelAccount = {
  id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true,
};

const tiktokTrend: NormalizedTrend = {
  platform: 'tiktok', format: 'hashtag', label: '#fika', country: 'SE',
  industry: 'food', period: 'week',
};

const igSnaps: ContentSnapshot[] = [
  { platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel', views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-19T00:00:00.000Z' },
  { platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel', views: 0, likes: 20, comments: 0, shares: 0, capturedAt: '2026-06-21T00:00:00.000Z' },
];

function makeDeps() {
  const upserted: any[] = [];
  const inserted: any[] = [];
  const tiktok: SourceAdapter = {
    id: 'tiktok', platform: 'tiktok', sourceClass: 'trend-feed',
    fetchTrends: async () => [tiktokTrend], fetchSnapshots: async () => [],
  };
  const instagram: SourceAdapter = {
    id: 'instagram', platform: 'instagram', sourceClass: 'raw-content',
    fetchTrends: async () => [], fetchSnapshots: async () => igSnaps,
  };
  const deps: EngineDeps = {
    adapters: { tiktok, instagram },
    listAccounts: async () => [account],
    insertSnapshots: async (s) => { inserted.push(...s); },
    upsertTrends: async (_src, t) => { upserted.push(...t); },
  };
  return { deps, upserted, inserted };
}

describe('runEngine', () => {
  it('Class A: passes trends straight to upsert, no snapshots', async () => {
    const { deps, upserted, inserted } = makeDeps();
    await runEngine(deps, { source: 'tiktok', country: 'SE', period: 'week' });
    expect(upserted).toEqual([tiktokTrend]);
    expect(inserted).toHaveLength(0);
  });

  it('Class B: stores snapshots then upserts derived trends', async () => {
    const { deps, upserted, inserted } = makeDeps();
    await runEngine(deps, { source: 'instagram', country: 'SE', period: 'week' });
    expect(inserted).toEqual(igSnaps);
    const reel = upserted.find((t) => t.format === 'reel');
    expect(reel?.velocityScore).toBe(10); // 20 likes over 2 days
  });

  it('throws on unknown source', async () => {
    const { deps } = makeDeps();
    await expect(runEngine(deps, { source: 'nope' as any, country: 'SE', period: 'week' }))
      .rejects.toThrow(/unknown source/i);
  });
});
