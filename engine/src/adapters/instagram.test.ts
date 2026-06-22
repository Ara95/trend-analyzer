import { describe, it, expect } from 'vitest';
import { createInstagramAdapter } from './instagram.js';
import type { PanelAccount } from './contract.js';

const accounts: PanelAccount[] = [
  { id: 'a1', handle: 'beautyswe', platform: 'instagram', industry: 'beauty', country: 'SE', active: true },
];

const rawReel = {
  id: 'r1', ownerUsername: 'beautyswe', videoPlayCount: 1000, likesCount: 50,
  commentsCount: 10, sharesCount: 2, musicInfo: { audio_id: 's1' },
};

describe('instagram adapter', () => {
  it('is a Class B raw-content source that returns no trends', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [], listAccounts: async () => accounts, actorId: 'x',
    });
    expect(adapter.sourceClass).toBe('raw-content');
    expect(await adapter.fetchTrends({ country: 'SE', period: 'day' })).toEqual([]);
  });

  it('maps raw reels to snapshots keyed to the panel account', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [rawReel], listAccounts: async () => accounts, actorId: 'x',
    });
    const snaps = await adapter.fetchSnapshots({ country: 'SE', period: 'day' });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      platform: 'instagram', accountId: 'a1', externalId: 'r1', format: 'reel',
      views: 1000, likes: 50, comments: 10, shares: 2, audioId: 's1',
    });
    expect(typeof snaps[0].capturedAt).toBe('string');
  });

  it('skips reels whose owner is not in the panel', async () => {
    const adapter = createInstagramAdapter({
      runActor: async () => [{ ...rawReel, ownerUsername: 'stranger' }],
      listAccounts: async () => accounts, actorId: 'x',
    });
    expect(await adapter.fetchSnapshots({ country: 'SE', period: 'day' })).toEqual([]);
  });
});
