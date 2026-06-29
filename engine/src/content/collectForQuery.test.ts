import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the shared pipeline so these tests exercise only the scrape+normalize wiring, not the DB writes
// runContentPipeline performs. The factory is self-contained (no out-of-scope ref, which vi.mock hoisting
// forbids); we retrieve the spy from the mocked module after the fact. We assert how collectForQuery
// calls it (platform, sourceQuery, gate).
vi.mock('./pipeline.js', () => ({ runContentPipeline: vi.fn(async () => []) }));

const { runContentPipeline } = (await import('./pipeline.js')) as unknown as {
  runContentPipeline: ReturnType<typeof vi.fn>;
};
const {
  scrapeSearchBuckets,
  SEARCH_FRESHNESS_BUCKETS,
  collectForQuery,
  collectInstagramForQuery,
} = await import('./collectForQuery.js');

// Minimal cfg: only the knobs collectForQuery reads. supabase/classifyDeps are opaque to it (the
// pipeline is stubbed), so dummies suffice.
const cfg: any = {
  tiktokActorId: 'clockworks/tt',
  igSearchActorId: 'patient_discovery/instagram-search-reels',
  igMaxPages: 1,
  searchResultsPerBucket: 15,
};
const deps = (runActor: any): any => ({ runActor, cfg, supabase: {}, classifyDeps: {} });

beforeEach(() => runContentPipeline.mockClear());

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

// A raw IG reel in the keyword-search actor's flat shape (enough keys for normalizeInstagramReels to
// keep it: `code` becomes the id, caption supplies text).
function reel(code: string): Record<string, any> {
  return { code, caption: { text: `clip ${code}` }, like_count: 1, user: { username: 'creator' } };
}

describe('collectInstagramForQuery', () => {
  it('calls the IG actor with the term + maxPages and folds normalized reels into the index', async () => {
    const calls: any[] = [];
    const runActor = async (actorId: string, input: any) => {
      calls.push({ actorId, input });
      return [reel('aaa'), reel('bbb')];
    };

    const count = await collectInstagramForQuery('iphone tips', deps(runActor));

    expect(count).toBe(2);
    expect(calls).toEqual([
      { actorId: 'patient_discovery/instagram-search-reels', input: { query: 'iphone tips', maxPages: 1 } },
    ]);
    // Folded into the same index as 'instagram', tagged with the term, language gate OFF (global).
    expect(runContentPipeline).toHaveBeenCalledTimes(1);
    const [platform, items, ctx] = runContentPipeline.mock.calls[0] as any[];
    expect(platform).toBe('instagram');
    expect(items.map((i: any) => i.id)).toEqual(['aaa', 'bbb']);
    expect(ctx.sourceQuery).toBe('iphone tips');
    expect(ctx.allowedLanguages).toEqual([]);
  });

  it('tolerates an empty/undefined actor result without throwing', async () => {
    const count = await collectInstagramForQuery('term', deps(async () => undefined));
    expect(count).toBe(0);
  });
});

describe('collectForQuery (TikTok + Instagram)', () => {
  it('scrapes both platforms and returns the combined count', async () => {
    const runActor = async (actorId: string) =>
      actorId === cfg.tiktokActorId
        ? [{ id: 't1' }, { id: 't2' }, { id: 't3' }] // returned for each of the 3 freshness tiers (deduped)
        : [reel('i1'), reel('i2')];

    const count = await collectForQuery('term', deps(runActor));

    // 3 distinct TikTok + 2 IG. Pipeline called once per platform.
    expect(count).toBe(5);
    const platforms = runContentPipeline.mock.calls.map((c) => c[0]);
    expect(platforms).toEqual(['tiktok', 'instagram']);
  });

  it('is non-fatal when the IG scrape fails — still returns the TikTok count', async () => {
    const runActor = async (actorId: string) => {
      if (actorId === cfg.tiktokActorId) return [{ id: 't1' }, { id: 't2' }];
      throw new Error('ig actor 429');
    };

    const count = await collectForQuery('term', deps(runActor));

    expect(count).toBe(2); // TikTok only; IG failure swallowed
    expect(runContentPipeline.mock.calls.map((c) => c[0])).toEqual(['tiktok']); // IG pipeline never reached
  });
});
