import { describe, it, expect } from 'vitest';
import {
  upsertCreators,
  upsertVideos,
  insertVideoSnapshots,
  updateVideoScores,
  upsertCreatorBaselines,
  updateVideoEmbeddings,
  pruneVideos,
  CREATORS_CONFLICT,
  VIDEOS_CONFLICT,
  VIDEO_SNAPSHOTS_CONFLICT,
  type CreatorRecord,
  type VideoRecord,
  type VideoSnapshotRecord,
} from './videos.js';

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

function fakeUpdateClient() {
  const calls: any[] = [];
  return {
    calls,
    from(table: string) {
      return {
        update: (values: any) => ({
          eq: async (col: string, val: unknown) => {
            calls.push({ table, values, col, val });
            return { error: null };
          },
        }),
      };
    },
  };
}

const creator: CreatorRecord = { platform: 'tiktok', handle: 'alice', followerCount: 1234 };
const video: VideoRecord = {
  platform: 'tiktok', platformVideoId: 'v1', creatorHandle: 'alice',
  caption: 'hej', hashtags: ['fika'], audioId: 's1',
  url: 'https://tiktok/v1', thumbnail: 'https://cdn/c.jpg', postedAt: '2026-06-20T00:00:00.000Z',
  language: 'sv', durationSeconds: 27,
  views: 1000, likes: 100, comments: 10, shares: 5, engagementRate: 0.115,
};
const snapshot: VideoSnapshotRecord = {
  platform: 'tiktok', platformVideoId: 'v1', capturedAt: '2026-06-22T00:00:00.000Z',
  views: 1000, likes: 100, comments: 10, shares: 5,
};

describe('upsertCreators', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await upsertCreators(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('maps creators and upserts with the conflict key', async () => {
    const c = fakeClient();
    await upsertCreators(c as any, [creator]);
    expect(c.calls[0].table).toBe('creators');
    expect(c.calls[0].opts).toEqual({ onConflict: CREATORS_CONFLICT });
    expect(c.calls[0].rows[0]).toEqual({
      platform: 'tiktok', handle: 'alice', display_name: null, avatar_url: null, follower_count: 1234,
    });
  });

  it('omits baseline/first_seen columns so re-ingest never clobbers step-2 scoring', async () => {
    const c = fakeClient();
    await upsertCreators(c as any, [creator]);
    const row = c.calls[0].rows[0];
    expect(row).not.toHaveProperty('baseline_views_median');
    expect(row).not.toHaveProperty('first_seen_at');
  });

  it('throws when the client returns an error', async () => {
    const c = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
    await expect(upsertCreators(c as any, [creator])).rejects.toThrow(/boom/);
  });
});

describe('upsertVideos', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await upsertVideos(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('maps videos to rows and upserts with the conflict key', async () => {
    const c = fakeClient();
    await upsertVideos(c as any, [video]);
    expect(c.calls[0].table).toBe('videos');
    expect(c.calls[0].opts).toEqual({ onConflict: VIDEOS_CONFLICT });
    const row = c.calls[0].rows[0];
    expect(row).toMatchObject({
      platform: 'tiktok', platform_video_id: 'v1', creator_handle: 'alice', caption: 'hej',
      hashtags: ['fika'], audio_id: 's1', url: 'https://tiktok/v1', thumbnail_url: 'https://cdn/c.jpg',
      posted_at: '2026-06-20T00:00:00.000Z', language: 'sv', duration_seconds: 27,
      views: 1000, likes: 100, comments: 10, shares: 5, engagement_rate: 0.115,
    });
    expect(typeof row.last_scraped_at).toBe('string');
  });

  it('rounds fractional values destined for integer columns (e.g. duration_seconds 93.3)', async () => {
    const c = fakeClient();
    await upsertVideos(c as any, [
      { ...video, durationSeconds: 93.3, views: 1000.7, likes: 10.2, comments: 0, shares: 4.9 },
    ]);
    const row = c.calls[0].rows[0];
    expect(row.duration_seconds).toBe(93);
    expect(row.views).toBe(1001);
    expect(row.likes).toBe(10);
    expect(row.shares).toBe(5);
  });

  it('omits trend_score/embedding/first_seen so step-2 scoring survives re-ingest', async () => {
    const c = fakeClient();
    await upsertVideos(c as any, [video]);
    const row = c.calls[0].rows[0];
    for (const col of ['trend_score', 'outlier_ratio', 'is_breakout', 'embedding', 'first_seen_at']) {
      expect(row).not.toHaveProperty(col);
    }
  });

  it('throws when the client returns an error', async () => {
    const c = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
    await expect(upsertVideos(c as any, [video])).rejects.toThrow(/boom/);
  });
});

describe('insertVideoSnapshots', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await insertVideoSnapshots(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('upserts snapshots idempotently on (platform, video, captured_at)', async () => {
    const c = fakeClient();
    await insertVideoSnapshots(c as any, [snapshot]);
    expect(c.calls[0].table).toBe('video_snapshots');
    expect(c.calls[0].opts).toEqual({ onConflict: VIDEO_SNAPSHOTS_CONFLICT });
    expect(c.calls[0].rows[0]).toEqual({
      platform: 'tiktok', platform_video_id: 'v1', captured_at: '2026-06-22T00:00:00.000Z',
      views: 1000, likes: 100, comments: 10, shares: 5,
    });
  });

  it('throws when the client returns an error', async () => {
    const c = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
    await expect(insertVideoSnapshots(c as any, [snapshot])).rejects.toThrow(/boom/);
  });
});

describe('updateVideoScores', () => {
  it('no-ops on empty input', async () => {
    const c = fakeUpdateClient();
    await updateVideoScores(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('updates only the trend columns, per video by id', async () => {
    const c = fakeUpdateClient();
    await updateVideoScores(c as any, [
      { id: 'v1', trendScore: 4.2, outlierRatio: 15, isBreakout: true },
      { id: 'v2', trendScore: 0.3, outlierRatio: 1.1, isBreakout: false },
    ]);
    expect(c.calls).toHaveLength(2);
    expect(c.calls[0]).toMatchObject({ table: 'videos', col: 'id', val: 'v1' });
    expect(c.calls[0].values).toEqual({ trend_score: 4.2, outlier_ratio: 15, is_breakout: true });
  });

  it('throws when an update returns an error', async () => {
    const c = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'boom' } }) }) }) };
    await expect(
      updateVideoScores(c as any, [{ id: 'v1', trendScore: 1, outlierRatio: 1, isBreakout: false }]),
    ).rejects.toThrow(/boom/);
  });
});

describe('upsertCreatorBaselines', () => {
  it('no-ops on empty input', async () => {
    const c = fakeClient();
    await upsertCreatorBaselines(c as any, []);
    expect(c.calls).toHaveLength(0);
  });

  it('upserts only baseline columns (rounded) with the conflict key', async () => {
    const c = fakeClient();
    await upsertCreatorBaselines(c as any, [{ platform: 'tiktok', handle: 'alice', medianViews: 1234.6 }]);
    expect(c.calls[0].table).toBe('creators');
    expect(c.calls[0].opts).toEqual({ onConflict: CREATORS_CONFLICT });
    const row = c.calls[0].rows[0];
    expect(row).toMatchObject({ platform: 'tiktok', handle: 'alice', baseline_views_median: 1235 });
    expect(typeof row.baseline_updated_at).toBe('string');
    // must NOT touch ingest columns, or it would clobber follower_count on conflict.
    expect(row).not.toHaveProperty('follower_count');
    expect(row).not.toHaveProperty('display_name');
  });

  it('throws when the client returns an error', async () => {
    const c = { from: () => ({ upsert: async () => ({ error: { message: 'boom' } }) }) };
    await expect(
      upsertCreatorBaselines(c as any, [{ platform: 'tiktok', handle: 'a', medianViews: 1 }]),
    ).rejects.toThrow(/boom/);
  });
});

describe('updateVideoEmbeddings', () => {
  it('writes the vector as a pgvector text literal, per video by id', async () => {
    const c = fakeUpdateClient();
    await updateVideoEmbeddings(c as any, [{ id: 'v1', embedding: [0.1, 0.2, 0.3] }]);
    expect(c.calls[0]).toMatchObject({ table: 'videos', col: 'id', val: 'v1' });
    expect(c.calls[0].values).toEqual({ embedding: '[0.1,0.2,0.3]' });
  });

  it('throws when an update returns an error', async () => {
    const c = { from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'boom' } }) }) }) };
    await expect(
      updateVideoEmbeddings(c as any, [{ id: 'v1', embedding: [1, 2] }]),
    ).rejects.toThrow(/boom/);
  });
});

describe('pruneVideos', () => {
  function fakeDeleteClient(result: { error: { message: string } | null; count: number | null }) {
    const calls: any[] = [];
    return {
      calls,
      from(table: string) {
        return {
          delete: (opts: any) => ({
            lt: async (col: string, val: unknown) => {
              calls.push({ table, opts, col, val });
              return result;
            },
          }),
        };
      },
    };
  }

  it('deletes videos with posted_at below a maxAgeDays cutoff and returns the count', async () => {
    const c = fakeDeleteClient({ error: null, count: 3 });
    const deleted = await pruneVideos(c as any, 30);
    expect(deleted).toBe(3);
    expect(c.calls[0]).toMatchObject({ table: 'videos', opts: { count: 'exact' }, col: 'posted_at' });
    // cutoff is an ISO string ~30 days before now.
    const cutoffMs = Date.parse(c.calls[0].val);
    const ageDays = (Date.now() - cutoffMs) / 86_400_000;
    expect(ageDays).toBeGreaterThan(29);
    expect(ageDays).toBeLessThan(31);
  });

  it('returns 0 when the driver reports a null count', async () => {
    const c = fakeDeleteClient({ error: null, count: null });
    expect(await pruneVideos(c as any, 30)).toBe(0);
  });

  it('throws when the client returns an error', async () => {
    const c = fakeDeleteClient({ error: { message: 'boom' }, count: null });
    await expect(pruneVideos(c as any, 30)).rejects.toThrow(/boom/);
  });
});
