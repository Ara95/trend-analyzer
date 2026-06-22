import { describe, it, expect } from 'vitest';
import { derive, periodWindowDays, engagement, DEFAULT_WEIGHTS } from './derive.js';
import type { ContentSnapshot, PanelAccount } from '../adapters/contract.js';

const acc: PanelAccount = {
  id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true,
};
const accountsById = new Map([[acc.id, acc]]);

function snap(over: Partial<ContentSnapshot>): ContentSnapshot {
  return {
    platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
    views: 0, likes: 0, comments: 0, shares: 0, capturedAt: '2026-06-20T00:00:00.000Z',
    ...over,
  };
}

describe('periodWindowDays', () => {
  it('maps periods to lookback days', () => {
    expect(periodWindowDays('day')).toBe(1);
    expect(periodWindowDays('week')).toBe(7);
    expect(periodWindowDays('month')).toBe(30);
  });
});

describe('engagement', () => {
  it('is a weighted sum', () => {
    expect(engagement(snap({ likes: 1, comments: 1, shares: 1, views: 100 }), DEFAULT_WEIGHTS))
      .toBe(1 * 1 + 1 * 2 + 1 * 3 + 100 * 0.05);
  });
});

describe('derive', () => {
  it('skips reels with a single snapshot (cold start)', () => {
    const out = derive([snap({})], accountsById, { country: 'SE', period: 'week' });
    expect(out).toEqual([]);
  });

  it('computes per-day velocity for a reel across two snapshots', () => {
    const out = derive(
      [
        snap({ likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ likes: 10, capturedAt: '2026-06-21T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    const reel = out.find((t) => t.format === 'reel');
    expect(reel?.velocityScore).toBe(5); // 10 engagement over 2 days
    expect(reel?.industry).toBe('beauty');
    expect(reel?.label).toBe('r1');
    expect(reel?.sampleSize).toBe(2);
    expect(reel?.sampleWindowDays).toBe(2);
  });

  it('aggregates audio velocity per audioId within an industry', () => {
    const out = derive(
      [
        snap({ externalId: 'r1', audioId: 's1', likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ externalId: 'r1', audioId: 's1', likes: 4, capturedAt: '2026-06-20T00:00:00.000Z' }),
        snap({ externalId: 'r2', audioId: 's1', likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ externalId: 'r2', audioId: 's1', likes: 6, capturedAt: '2026-06-20T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    const audio = out.find((t) => t.format === 'audio');
    expect(audio?.label).toBe('s1');
    expect(audio?.velocityScore).toBe(10); // 4/day + 6/day
    expect(audio?.sampleSize).toBe(2); // two reels
  });

  it('drops snapshots outside the period window', () => {
    const out = derive(
      [
        snap({ likes: 0, capturedAt: '2026-05-01T00:00:00.000Z' }), // outside 7d of latest
        snap({ likes: 10, capturedAt: '2026-06-21T00:00:00.000Z' }),
      ],
      accountsById,
      { country: 'SE', period: 'week' },
    );
    expect(out).toEqual([]); // only one snapshot remains in window -> cold start
  });

  it('falls back to industry "all" when the account is not in the panel map', () => {
    const out = derive(
      [
        snap({ accountId: 'unknown', likes: 0, capturedAt: '2026-06-19T00:00:00.000Z' }),
        snap({ accountId: 'unknown', likes: 10, capturedAt: '2026-06-21T00:00:00.000Z' }),
      ],
      new Map(),
      { country: 'SE', period: 'week' },
    );
    const reel = out.find((t) => t.format === 'reel');
    expect(reel?.industry).toBe('all');
  });
});
