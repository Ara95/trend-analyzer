import { describe, it, expect } from 'vitest';
import { createTikTokAdapter } from './tiktok.js';
import type { PanelAccount } from './contract.js';

const accounts: PanelAccount[] = [
  { id: 'a1', handle: 'foodieswe', platform: 'tiktok', industry: 'food', country: 'SE', active: true },
];

const rawVideo = {
  id: 'v1',
  authorMeta: { name: 'foodieswe' },
  text: 'recept',
  playCount: 5000,
  diggCount: 300,
  commentCount: 40,
  shareCount: 12,
  musicMeta: { musicId: 'm1' },
  webVideoUrl: 'https://www.tiktok.com/@foodieswe/video/v1',
};

describe('tiktok adapter (Class B)', () => {
  it('is a Class B raw-content source that returns no trends', async () => {
    const adapter = createTikTokAdapter({
      runActor: async () => [], listAccounts: async () => accounts, actorId: 'x',
    });
    expect(adapter.sourceClass).toBe('raw-content');
    expect(await adapter.fetchTrends({ country: 'SE', period: 'day' })).toEqual([]);
  });

  it('maps raw videos to snapshots keyed to the panel account', async () => {
    const adapter = createTikTokAdapter({
      runActor: async () => [rawVideo], listAccounts: async () => accounts, actorId: 'x',
    });
    const snaps = await adapter.fetchSnapshots({ country: 'SE', period: 'day' });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({
      platform: 'tiktok', accountId: 'a1', externalId: 'v1', format: 'video',
      views: 5000, likes: 300, comments: 40, shares: 12, audioId: 'm1',
      caption: 'recept', videoUrl: 'https://www.tiktok.com/@foodieswe/video/v1',
    });
    expect(typeof snaps[0].capturedAt).toBe('string');
  });

  it('passes the panel handles as profiles to the actor', async () => {
    let captured: Record<string, unknown> | null = null;
    const adapter = createTikTokAdapter({
      runActor: async (_id, input) => {
        captured = input;
        return [];
      },
      listAccounts: async () => accounts,
      actorId: 'x',
    });
    await adapter.fetchSnapshots({ country: 'SE', period: 'day' });
    expect(captured!.profiles).toEqual(['foodieswe']);
  });

  it('skips videos whose author is not in the panel', async () => {
    const adapter = createTikTokAdapter({
      runActor: async () => [{ ...rawVideo, authorMeta: { name: 'stranger' } }],
      listAccounts: async () => accounts, actorId: 'x',
    });
    expect(await adapter.fetchSnapshots({ country: 'SE', period: 'day' })).toEqual([]);
  });
});
