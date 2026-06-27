import { describe, it, expect } from 'vitest';
import { rankContent, videoRecords } from './collect.js';

const NOW = Date.parse('2026-06-22T00:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const items = [
  // 2 days old, modest engagement
  { id: 'a', createTimeISO: daysAgo(2), playCount: 10000, diggCount: 1000, commentCount: 100, shareCount: 50, text: 'a', authorMeta: { name: 'Alice' }, musicMeta: { musicId: 's1' } },
  // 1 day old, same engagement as A → higher score (younger)
  { id: 'b', createTimeISO: daysAgo(1), playCount: 10000, diggCount: 1000, commentCount: 100, shareCount: 50, text: 'b', authorMeta: { name: 'Bob' } },
  // 40 days old → outside a 'week' window, dropped
  { id: 'c', createTimeISO: daysAgo(40), playCount: 999999, diggCount: 99999, commentCount: 9999, shareCount: 9999 },
  // duplicate of A (surfaced under another query) → deduped
  { id: 'a', createTimeISO: daysAgo(2), playCount: 10000, diggCount: 1000, commentCount: 100, shareCount: 50 },
  // no createTime → dropped
  { id: 'd', playCount: 5000, diggCount: 100 },
];

describe('rankContent', () => {
  it('drops content outside the period window, missing dates, and duplicates', () => {
    const out = rankContent(items, NOW, 'week');
    expect(out.map((c) => c.externalId)).toEqual(['b', 'a']); // c (too old), d (no date) gone; a deduped
  });

  it('ranks younger content higher when engagement is equal (recency-normalized)', () => {
    const out = rankContent(items, NOW, 'week');
    expect(out[0].externalId).toBe('b'); // 1 day old beats 2 days old at equal engagement
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('maps engagement signals and author/audio', () => {
    const a = rankContent(items, NOW, 'week').find((c) => c.externalId === 'a')!;
    expect(a).toMatchObject({ views: 10000, likes: 1000, comments: 100, shares: 50, handle: 'alice', audioId: 's1' });
    expect(a.ageDays).toBeCloseTo(2, 5);
  });

  it('drops the 40-day video even on a month window (40d > 30d)', () => {
    const out = rankContent(items, NOW, 'month');
    expect(out.map((c) => c.externalId)).not.toContain('c');
  });

  it('extracts native hashtag names (deduped, #-stripped, lowercased)', () => {
    const htItems = [
      {
        id: 'h',
        createTimeISO: daysAgo(1),
        playCount: 100,
        hashtags: [{ name: 'Fotboll' }, { name: '#Allsvenskan' }, { name: 'fotboll' }, 'matchday'],
      },
    ];
    const out = rankContent(htItems, NOW, 'week');
    expect(out[0].hashtags).toEqual(['fotboll', 'allsvenskan', 'matchday']);
  });

  it('yields [] hashtags when the item has none', () => {
    const out = rankContent(items, NOW, 'week').find((c) => c.externalId === 'b')!;
    expect(out.hashtags).toEqual([]);
  });

  it('gates by language when allowedLanguages is set, treating missing language as "un"', () => {
    const langItems = [
      { id: 'sv', createTimeISO: daysAgo(1), playCount: 100, textLanguage: 'sv' },
      { id: 'en', createTimeISO: daysAgo(1), playCount: 100, textLanguage: 'en' },
      { id: 'none', createTimeISO: daysAgo(1), playCount: 100 }, // no language → 'un'
    ];
    const kept = rankContent(langItems, NOW, 'week', { allowedLanguages: ['sv', 'un'] });
    expect(kept.map((c) => c.externalId).sort()).toEqual(['none', 'sv']); // 'en' dropped
  });
});

describe('videoRecords (index ingest)', () => {
  it('keeps every valid video regardless of period window or language', () => {
    // c is 40 days old (dropped by rankContent on any window); en is non-Swedish. Both kept here:
    // the index is the global corpus, period/language are query-time filters.
    const out = videoRecords(items, NOW);
    expect(out.map((c) => c.externalId).sort()).toEqual(['a', 'b', 'c']); // d dropped (no date), a deduped
  });

  it('drops items older than maxAgeDays when the freshness ceiling is set', () => {
    // Same corpus, now capped at 30 days: c (40d old) is dropped, the fresh ones stay.
    const out = videoRecords(items, NOW, { maxAgeDays: 30 });
    expect(out.map((c) => c.externalId).sort()).toEqual(['a', 'b']); // c (40d) gone, d (no date) gone
  });

  it('still drops items with no id or no parseable date, and dedupes', () => {
    const out = videoRecords(items, NOW);
    expect(out.map((c) => c.externalId)).not.toContain('d'); // no createTime
    expect(out.filter((c) => c.externalId === 'a')).toHaveLength(1); // deduped
  });

  it('carries the index fields (postedAt, url, authorId, followerCount, durationSeconds)', () => {
    const raw = [{
      id: 'v1', createTimeISO: daysAgo(3), playCount: 500, diggCount: 40, commentCount: 5, shareCount: 2,
      text: 'hej', textLanguage: 'sv',
      authorMeta: { name: 'Cara', id: '12345', fans: 9001 },
      videoMeta: { coverUrl: 'https://cdn/cover.jpg', duration: 27 },
      webVideoUrl: 'https://www.tiktok.com/@cara/video/v1',
    }];
    const [v] = videoRecords(raw, NOW);
    expect(v).toMatchObject({
      externalId: 'v1', handle: 'cara', authorId: '12345', followerCount: 9001,
      durationSeconds: 27, url: 'https://www.tiktok.com/@cara/video/v1', language: 'sv',
    });
    expect(v.postedAt).toBe(daysAgo(3)); // createTimeISO round-tripped through Date
  });

  it('leaves index fields undefined when the raw item lacks them (e.g. IG normalized shape)', () => {
    const raw = [{ id: 'ig1', createTimeISO: daysAgo(1), playCount: 100, authorMeta: { name: 'ig_user' } }];
    const [v] = videoRecords(raw, NOW);
    expect(v.url).toBeUndefined();
    expect(v.authorId).toBeUndefined();
    expect(v.followerCount).toBeUndefined();
    expect(v.durationSeconds).toBeUndefined();
    expect(v.postedAt).toBe(daysAgo(1)); // postedAt always present (derived from createTimeISO)
  });
});
