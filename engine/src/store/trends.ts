import type { NormalizedTrend, Platform } from '../adapters/contract.js';

export const TRENDS_CONFLICT = 'source,platform,country,industry,format,label,period';

export interface SupabaseLike {
  from(table: string): {
    upsert(rows: unknown[], opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
    insert(rows: unknown[]): Promise<{ error: { message: string } | null }>;
    select(columns?: string): any;
  };
}

// Both platforms are now Class B (raw-content): trends are derived from raw content
// (account velocity or content-first engagement/recency), not a native platform trend feed.
const SOURCE_CLASS = {
  tiktok: 'raw-content',
  instagram: 'raw-content',
} as const;

export async function upsertTrends(
  client: SupabaseLike,
  source: Platform,
  trends: NormalizedTrend[],
): Promise<void> {
  if (trends.length === 0) return;
  const computedAt = new Date().toISOString();
  const rows = trends.map((t) => ({
    source,
    source_class: SOURCE_CLASS[source],
    platform: t.platform,
    country: t.country,
    industry: t.industry,
    format: t.format,
    label: t.label,
    period: t.period,
    rank: t.rank ?? null,
    rank_movement: t.rankMovement ?? null,
    direction: t.direction ?? null,
    views: t.views ?? null,
    velocity_score: t.velocityScore ?? null,
    sample_size: t.sampleSize ?? null,
    sample_window_days: t.sampleWindowDays ?? null,
    trend_score: t.trendScore ?? null,
    is_breakout: t.isBreakout ?? false,
    metrics: t.metrics ?? {},
    computed_at: computedAt,
  }));
  const { error } = await client.from('trends').upsert(rows, { onConflict: TRENDS_CONFLICT });
  if (error) throw new Error(`upsertTrends failed: ${error.message}`);
}
