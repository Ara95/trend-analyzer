import { describe, it, expect } from 'vitest';
import { runEngine, ingest, type EngineDeps } from './engine.js';
import type { NormalizedTrend, ContentSnapshot, SourceAdapter, PanelAccount } from './adapters/contract.js';

const account: PanelAccount = {
  id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true,
};

const tiktokTrend: NormalizedTrend = {
  platform: 'tiktok', format: 'hashtag', label: '#fika', country: 'SE',
  industry: 'food', period: 'week',
};

function snap(over: Partial<ContentSnapshot>): ContentSnapshot {
  return {
    platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
    views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

// Stateful fake store: retains inserted snapshots (simulates content_snapshots table).
function makeDeps(igFetch?: () => Promise<ContentSnapshot[]>) {
  const store: ContentSnapshot[] = [];
  const upserted: NormalizedTrend[] = [];
  const inserted: ContentSnapshot[] = [];
  const tiktok: SourceAdapter = {
    id: 'tiktok', platform: 'tiktok', sourceClass: 'trend-feed',
    fetchTrends: async () => [tiktokTrend], fetchSnapshots: async () => [],
  };
  const instagram: SourceAdapter = {
    id: 'instagram', platform: 'instagram', sourceClass: 'raw-content',
    fetchTrends: async () => [],
    fetchSnapshots: igFetch ?? (async () => []),
  };
  const deps: EngineDeps = {
    adapters: { tiktok, instagram },
    listAccounts: async () => [account],
    insertSnapshots: async (s) => { inserted.push(...s); store.push(...s); },
    loadRecentSnapshots: async (ids) => store.filter((s) => ids.includes(s.accountId)),
    upsertTrends: async (_src, t) => { upserted.push(...t); },
  };
  return { deps, upserted, inserted, store };
}

describe('runEngine', () => {
  it('Class A: passes trends straight to upsert, no snapshots', async () => {
    const { deps, upserted, inserted } = makeDeps();
    await runEngine(deps, { source: 'tiktok', country: 'SE', period: 'week' });
    expect(upserted).toEqual([tiktokTrend]);
    expect(inserted).toHaveLength(0);
  });

  it('Class B: derives trends from accumulated snapshot history', async () => {
    const { deps, upserted, store } = makeDeps();
    store.push(
      snap({ likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
      snap({ likes: 20, capturedAt: '2026-06-21T00:00:00.000Z' }),
    );
    await runEngine(deps, { source: 'instagram', country: 'SE', period: 'week' });
    const reel = upserted.find((t) => t.format === 'reel');
    expect(reel?.velocityScore).toBe(10); // 20 likes over 2 days
  });

  it('throws on unknown source', async () => {
    const { deps } = makeDeps();
    await expect(runEngine(deps, { source: 'nope' as any, country: 'SE', period: 'week' }))
      .rejects.toThrow(/unknown source/i);
  });
});

describe('ingest', () => {
  it('Class B: fetches and stores snapshots', async () => {
    const fresh = snap({ likes: 5, capturedAt: '2026-06-20T00:00:00.000Z' });
    const { deps, inserted } = makeDeps(async () => [fresh]);
    await ingest(deps, 'instagram', 'SE');
    expect(inserted).toEqual([fresh]);
  });

  it('Class A: is a no-op (no raw content to ingest)', async () => {
    const { deps, inserted } = makeDeps();
    await ingest(deps, 'tiktok', 'SE');
    expect(inserted).toHaveLength(0);
  });

  it('throws on unknown source', async () => {
    const { deps } = makeDeps();
    await expect(ingest(deps, 'nope' as any, 'SE')).rejects.toThrow(/unknown source/i);
  });
});

describe('end-to-end Class B accumulation', () => {
  it('produces a trend only after a second ingest (cold start then velocity)', async () => {
    let call = 0;
    const igFetch = async (): Promise<ContentSnapshot[]> => {
      call += 1;
      return call === 1
        ? [snap({ likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' })]
        : [snap({ likes: 20, capturedAt: '2026-06-21T00:00:00.000Z' })];
    };
    const { deps, upserted } = makeDeps(igFetch);

    await ingest(deps, 'instagram', 'SE');
    await runEngine(deps, { source: 'instagram', country: 'SE', period: 'week' });
    expect(upserted).toHaveLength(0); // cold start: only 1 snapshot

    await ingest(deps, 'instagram', 'SE');
    await runEngine(deps, { source: 'instagram', country: 'SE', period: 'week' });
    expect(upserted.find((t) => t.format === 'reel')?.velocityScore).toBe(10);
  });
});
