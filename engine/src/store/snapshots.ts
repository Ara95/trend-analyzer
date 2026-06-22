import type { ContentSnapshot } from '../adapters/contract.js';
import type { SupabaseLike } from './trends.js';

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
    metrics: s.metrics ?? {},
  }));
  const { error } = await client.from('content_snapshots').insert(rows);
  if (error) throw new Error(`insertSnapshots failed: ${error.message}`);
}
