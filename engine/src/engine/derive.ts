import type {
  ContentSnapshot,
  NormalizedTrend,
  PanelAccount,
  Period,
  RunContext,
} from '../adapters/contract.js';
import type { Industry } from '../config/industries.js';

const MS_PER_DAY = 86_400_000;

export interface Weights {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}

export const DEFAULT_WEIGHTS: Weights = { likes: 1, comments: 2, shares: 3, views: 0.05 };

export interface DeriveOptions {
  weights?: Weights;
  topN?: number;
}

export function periodWindowDays(period: Period): number {
  return period === 'day' ? 1 : period === 'week' ? 7 : 30;
}

export function engagement(s: ContentSnapshot, w: Weights): number {
  return s.likes * w.likes + s.comments * w.comments + s.shares * w.shares + s.views * w.views;
}

interface ReelVelocity {
  externalId: string;
  audioId?: string;
  industry: Industry;
  velocity: number;
  sampleSize: number;
  windowDays: number;
}

export function derive(
  snapshots: ContentSnapshot[],
  accountsById: Map<string, PanelAccount>,
  ctx: RunContext,
  opts: DeriveOptions = {},
): NormalizedTrend[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const topN = opts.topN ?? 50;
  if (snapshots.length === 0) return [];

  // Reference "now" = latest capture; window filters relative to it (deterministic).
  const refMs = Math.max(...snapshots.map((s) => Date.parse(s.capturedAt)));
  const windowMs = periodWindowDays(ctx.period) * MS_PER_DAY;
  const inWindow = snapshots.filter((s) => refMs - Date.parse(s.capturedAt) <= windowMs);

  // Per-reel velocity (needs >=2 snapshots in window).
  const byReel = new Map<string, ContentSnapshot[]>();
  for (const s of inWindow) {
    const arr = byReel.get(s.externalId) ?? [];
    arr.push(s);
    byReel.set(s.externalId, arr);
  }

  const reels: ReelVelocity[] = [];
  for (const [externalId, group] of byReel) {
    if (group.length < 2) continue; // cold start
    const sorted = [...group].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const deltaDays = (Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / MS_PER_DAY;
    if (deltaDays <= 0) continue;
    const velocity = (engagement(last, weights) - engagement(first, weights)) / deltaDays;
    const industry = accountsById.get(last.accountId)?.industry ?? 'all';
    reels.push({
      externalId,
      audioId: last.audioId,
      industry,
      velocity,
      sampleSize: group.length,
      windowDays: Math.round(deltaDays),
    });
  }

  const reelTrends: NormalizedTrend[] = reels.map((r) => ({
    platform: 'instagram',
    format: 'reel',
    label: r.externalId,
    country: ctx.country,
    industry: r.industry,
    period: ctx.period,
    velocityScore: r.velocity,
    sampleSize: r.sampleSize,
    sampleWindowDays: r.windowDays,
  }));

  // Audio trends: sum reel velocities grouped by (industry, audioId).
  const byAudio = new Map<string, ReelVelocity[]>();
  for (const r of reels) {
    if (!r.audioId) continue;
    const key = `${r.industry} ${r.audioId}`;
    const arr = byAudio.get(key) ?? [];
    arr.push(r);
    byAudio.set(key, arr);
  }

  const audioTrends: NormalizedTrend[] = [];
  for (const [, group] of byAudio) {
    const velocity = group.reduce((sum, r) => sum + r.velocity, 0);
    audioTrends.push({
      platform: 'instagram',
      format: 'audio',
      label: group[0].audioId!,
      country: ctx.country,
      industry: group[0].industry,
      period: ctx.period,
      velocityScore: velocity,
      sampleSize: group.length,
      sampleWindowDays: Math.max(...group.map((r) => r.windowDays)),
    });
  }

  return rankTopN([...reelTrends, ...audioTrends], topN);
}

// Keep only the top-N trends (by velocity, desc) within each (industry, format) bucket.
function rankTopN(trends: NormalizedTrend[], topN: number): NormalizedTrend[] {
  const buckets = new Map<string, NormalizedTrend[]>();
  for (const t of trends) {
    const key = `${t.industry} ${t.format}`;
    const arr = buckets.get(key) ?? [];
    arr.push(t);
    buckets.set(key, arr);
  }
  const out: NormalizedTrend[] = [];
  for (const [, arr] of buckets) {
    arr.sort((a, b) => (b.velocityScore ?? 0) - (a.velocityScore ?? 0));
    out.push(...arr.slice(0, topN));
  }
  return out;
}
