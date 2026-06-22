import { describe, it, expect } from 'vitest';
import { insertSnapshots, loadRecentSnapshots } from './snapshots.js';
import type { ContentSnapshot } from '../adapters/contract.js';

const snap: ContentSnapshot = {
  platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
  views: 100, likes: 5, comments: 2, shares: 1, audioId: 's1',
  capturedAt: '2026-06-20T00:00:00.000Z',
};

function fakeClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return { insert: async (rows: any[]) => { calls.push({ table, rows }); return { error: null }; } };
    },
  };
}

function fakeQueryClient(rows: any[]) {
  const calls: any[] = [];
  const builder: any = {
    select() { return builder; },
    in(col: string, vals: unknown[]) { calls.push(['in', col, vals]); return builder; },
    gte(col: string, _val: unknown) { calls.push(['gte', col]); return builder; },
    then(resolve: (v: any) => void) { resolve({ data: rows, error: null }); },
  };
  return { calls, from: () => builder };
}

describe('loadRecentSnapshots', () => {
  it('returns [] for empty accountIds without querying', async () => {
    const c = fakeQueryClient([]);
    expect(await loadRecentSnapshots(c as any, [], 7)).toEqual([]);
    expect(c.calls).toHaveLength(0);
  });

  it('queries by account ids + window and maps rows to ContentSnapshot', async () => {
    const c = fakeQueryClient([
      { platform: 'instagram', account_id: 'a1', external_id: 'r1', format: 'reel',
        views: 100, likes: 5, comments: 2, shares: 1, audio_id: 's1',
        captured_at: '2026-06-20T00:00:00.000Z', metrics: {} },
    ]);
    const out = await loadRecentSnapshots(c as any, ['a1'], 7);
    expect(c.calls[0]).toEqual(['in', 'account_id', ['a1']]);
    expect(out[0]).toMatchObject({
      platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
      views: 100, likes: 5, comments: 2, shares: 1, audioId: 's1',
      capturedAt: '2026-06-20T00:00:00.000Z',
    });
  });
});

describe('insertSnapshots', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await insertSnapshots(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('maps snapshots to snake_case rows', async () => {
    const c = fakeClient();
    await insertSnapshots(c as any, [snap]);
    expect(c.calls[0].table).toBe('content_snapshots');
    expect(c.calls[0].rows[0]).toMatchObject({
      platform: 'instagram', account_id: 'a1', external_id: 'r1', format: 'reel',
      views: 100, likes: 5, comments: 2, shares: 1, audio_id: 's1',
      captured_at: '2026-06-20T00:00:00.000Z',
    });
  });
});
