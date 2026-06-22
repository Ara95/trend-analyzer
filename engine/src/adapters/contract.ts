import type { Industry } from '../config/industries.js';

export type SourceClass = 'trend-feed' | 'raw-content';
export type Platform = 'tiktok' | 'instagram';
export type Format = 'hashtag' | 'audio' | 'video' | 'creator' | 'reel';
export type Period = 'day' | 'week' | 'month';
export type Direction = 'rising' | 'falling' | 'stable';

export interface RunContext {
  country: string; // ISO-2, e.g. 'SE'
  period: Period;
}

export interface PanelAccount {
  id: string;
  handle: string;
  platform: Platform;
  industry: Industry;
  country: string;
  active: boolean;
}

export interface NormalizedTrend {
  platform: Platform;
  format: Format;
  label: string;
  country: string;
  industry: Industry; // 'all' for country-level — never null
  period: Period;
  // Class A native (nullable for Class B):
  rank?: number;
  rankMovement?: number;
  direction?: Direction;
  views?: number;
  // Class B derived (nullable for Class A):
  velocityScore?: number;
  sampleSize?: number;
  sampleWindowDays?: number;
  metrics?: Record<string, unknown>;
}

export interface ContentSnapshot {
  platform: Platform;
  accountId: string;
  externalId: string; // reel/video id
  format: Format;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  audioId?: string;
  capturedAt: string; // ISO timestamp
  metrics?: Record<string, unknown>;
}

// Injected Apify boundary: takes an actor id + input, returns dataset items.
export type ActorRunner = (
  actorId: string,
  input: Record<string, unknown>,
) => Promise<unknown[]>;

export interface SourceAdapter {
  id: string;
  platform: Platform;
  sourceClass: SourceClass;
  fetchTrends(ctx: RunContext): Promise<NormalizedTrend[]>;
  fetchSnapshots(ctx: RunContext): Promise<ContentSnapshot[]>;
}

export function isClassA(a: SourceAdapter): boolean {
  return a.sourceClass === 'trend-feed';
}
