import { describe, it, expect } from 'vitest';
import { insertSnapshots } from './snapshots.js';
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
