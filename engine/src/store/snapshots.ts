import type { ContentSnapshot } from '../adapters/contract.js';
import type { SupabaseLike } from './trends.js';

export interface SnapshotQueryClient {
  from(table: string): {
    select(columns?: string): {
      in(col: string, vals: unknown[]): { gte(col: string, val: unknown): unknown };
    };
  };
}

export async function insertSnapshots(
  client: SupabaseLike,
  snapshots: ContentSnapshot[],
): Promise<void> {
  if (snapshots.length === 0) return;
  const rows = snapshots.map((s) => ({
    platform: s.platform,
    account_id: s.accountId,
    external_id: s.externalId,
    format: s.format,
    views: s.views,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    audio_id: s.audioId ?? null,
    captured_at: s.capturedAt,
    // caption is a queryable column; videoUrl/transcript ride in metrics (no extra columns).
    caption: s.caption ?? null,
    metrics: {
      ...(s.metrics ?? {}),
      ...(s.videoUrl ? { videoUrl: s.videoUrl } : {}),
      ...(s.transcript ? { transcript: s.transcript } : {}),
    },
  }));
  const { error } = await client.from('content_snapshots').insert(rows);
  if (error) throw new Error(`insertSnapshots failed: ${error.message}`);
}

export async function loadRecentSnapshots(
  client: SnapshotQueryClient,
  accountIds: string[],
  windowDays: number,
): Promise<ContentSnapshot[]> {
  if (accountIds.length === 0) return [];
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = (await client
    .from('content_snapshots')
    .select(
      'platform, account_id, external_id, format, views, likes, comments, shares, audio_id, captured_at, caption, metrics',
    )
    .in('account_id', accountIds)
    .gte('captured_at', cutoff)) as { data: Record<string, any>[] | null; error: { message: string } | null };
  if (error) throw new Error(`loadRecentSnapshots failed: ${error.message}`);
  return (data ?? []).map((r) => {
    const metrics = (r.metrics ?? {}) as Record<string, unknown>;
    return {
      platform: r.platform,
      accountId: r.account_id,
      externalId: r.external_id,
      format: r.format,
      views: r.views,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      audioId: r.audio_id ?? undefined,
      capturedAt: r.captured_at,
      metrics,
      // Reconstruct classification signals stashed at insert time.
      caption: typeof r.caption === 'string' ? r.caption : undefined,
      videoUrl: typeof metrics.videoUrl === 'string' ? (metrics.videoUrl as string) : undefined,
      transcript: typeof metrics.transcript === 'string' ? (metrics.transcript as string) : undefined,
    };
  });
}
