import { describe, it, expect } from 'vitest';
import { upsertTrends, TRENDS_CONFLICT } from './trends.js';
import type { NormalizedTrend } from '../adapters/contract.js';

function fakeClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return {
        upsert: async (rows: any[], opts: any) => {
          calls.push({ table, rows, opts });
          return { error: null };
        },
      };
    },
  };
}

const trend: NormalizedTrend = {
  platform: 'tiktok', format: 'hashtag', label: '#fika', country: 'SE',
  industry: 'food', period: 'week', rank: 1, rankMovement: 3, direction: 'rising',
};

describe('upsertTrends', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await upsertTrends(c as any, 'tiktok', [trend].slice(0, 0));
    expect(c.calls).toHaveLength(0);
  });

  it('maps trends to rows and upserts with the conflict key', async () => {
    const c = fakeClient();
    await upsertTrends(c as any, 'tiktok', [trend]);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0].table).toBe('trends');
    expect(c.calls[0].opts).toEqual({ onConflict: TRENDS_CONFLICT });
    const row = c.calls[0].rows[0];
    expect(row).toMatchObject({
      source: 'tiktok', source_class: 'trend-feed', platform: 'tiktok',
      country: 'SE', industry: 'food', format: 'hashtag', label: '#fika',
      period: 'week', rank: 1, rank_movement: 3, direction: 'rising',
    });
    expect(typeof row.computed_at).toBe('string');
  });

  it('throws when the client returns an error', async () => {
    const c = {
      from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }),
    };
    await expect(upsertTrends(c as any, 'tiktok', [trend])).rejects.toThrow(/boom/);
  });
});
