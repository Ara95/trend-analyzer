import { describe, it, expect } from 'vitest';
import { createTikTokAdapter, periodToDays } from './tiktok.js';

const rawHashtag = {
  type: 'hashtag', hashtagName: 'fika', industry: 'food', rank: 1, rankDiff: 2,
  trend: 'rising', views: 500000,
};
const rawSound = { type: 'sound', title: 'Sommar', rank: 1, audioLink: 'http://a', usageCount: 9000 };

describe('periodToDays', () => {
  it('maps week->7 and month->30', () => {
    expect(periodToDays('week')).toBe(7);
    expect(periodToDays('month')).toBe(30);
  });
  it('throws for day (not offered by Creative Center)', () => {
    expect(() => periodToDays('day')).toThrow(/day/);
  });
});

describe('tiktok adapter', () => {
  it('is a Class A trend-feed source that returns no snapshots', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [], actorId: 'x' });
    expect(adapter.sourceClass).toBe('trend-feed');
    expect(await adapter.fetchSnapshots({ country: 'SE', period: 'week' })).toEqual([]);
  });

  it('maps hashtags per industry with native rank fields', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [rawHashtag], actorId: 'x' });
    const trends = await adapter.fetchTrends({ country: 'SE', period: 'week' });
    const h = trends.find((t) => t.format === 'hashtag');
    expect(h).toMatchObject({
      platform: 'tiktok', format: 'hashtag', label: 'fika', country: 'SE',
      industry: 'food', period: 'week', rank: 1, rankMovement: 2, direction: 'rising', views: 500000,
    });
  });

  it('maps sounds as country-level (industry all)', async () => {
    const adapter = createTikTokAdapter({ runActor: async () => [rawSound], actorId: 'x' });
    const trends = await adapter.fetchTrends({ country: 'SE', period: 'week' });
    const s = trends.find((t) => t.format === 'audio');
    expect(s).toMatchObject({
      platform: 'tiktok', format: 'audio', label: 'Sommar', industry: 'all', rank: 1,
    });
    expect(s?.metrics).toMatchObject({ audioLink: 'http://a', usageCount: 9000 });
  });

  it('passes the mapped day-count to the actor input', async () => {
    let received: any;
    const adapter = createTikTokAdapter({
      runActor: async (_id, input) => { received = input; return []; }, actorId: 'x',
    });
    await adapter.fetchTrends({ country: 'SE', period: 'month' });
    expect(received).toMatchObject({ countryCode: 'SE', period: 30 });
  });
});
