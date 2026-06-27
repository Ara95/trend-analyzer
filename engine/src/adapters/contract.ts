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
  // Trend signal: how much this stands out from its cohort (robust z), and whether it crosses the
  // breakout cutoff. velocityScore is raw magnitude; trendScore is "is it actually a trend".
  trendScore?: number;
  isBreakout?: boolean;
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
  // Classification signals (defensively populated; actor schemas vary). The caption is
  // persisted as a column; videoUrl/transcript ride in metrics (see store/snapshots.ts).
  caption?: string;
  hashtags?: string[]; // native hashtags from the scrape (TikTok hashtags[].name / IG caption #tags)
  thumbnail?: string; // cover image URL — the cheap visual signal for content-first classification
  videoUrl?: string; // download URL for vision keyframe sampling
  transcript?: string; // speech-to-text, when the actor transcript add-on is requested
  handle?: string; // owner handle — cache key + unseen-account routing
}

// ---------------------------------------------------------------------------
// Classification subsystem contracts
// ---------------------------------------------------------------------------

// Account-level signals used to classify an unseen account once (layer 3).
export interface AccountSignals {
  handle: string;
  platform: Platform;
  displayName?: string;
  bio?: string;
  recentCaptions?: string[];
}

// Multi-label output: an industry with a 0..1 confidence. Never a single hard label.
export interface IndustryLabel {
  industry: Industry;
  confidence: number;
}

export type ClassificationMethod = 'panel' | 'cached' | 'account_infer' | 'content';

export interface ClassificationResult {
  labels: IndustryLabel[];
  primaryIndustry: Industry;
  method: ClassificationMethod;
}

// Per-industry definition vector for in-process zero-shot comparison (layer 3/4a).
export interface IndustryVector {
  industry: Industry; // a real industry, never 'all'
  embedding: number[];
}

// The account_classification cache row, as read back for layer 2.
export interface CachedClassification {
  labels: IndustryLabel[];
  method: ClassificationMethod;
  classifiedAt: string; // ISO timestamp
}

// Write shapes for the persistence layer.
export interface AccountClassificationWrite {
  platform: string; // plain text — YouTube-ready, not the closed Platform union
  accountKey: string; // lowercased handle
  labels: IndustryLabel[];
  primaryIndustry: Industry;
  method: ClassificationMethod;
}

export interface ContentIndustryWrite {
  platform: string;
  externalId: string;
  industry: Industry;
  confidence: number;
  method: ClassificationMethod;
}

// Injected model providers — concrete OpenAI impls live in src/providers/openai.ts;
// tests inject fakes with call counters to assert the cost-control criteria.
export type Embedder = (texts: string[]) => Promise<number[][]>;
export type Tagger = (input: { text: string; industries: Industry[] }) => Promise<IndustryLabel[]>;
export type VisionTagger = (
  input: { imageUrls: string[]; industries: Industry[] },
) => Promise<IndustryLabel[]>;

// Content-first classifier: one multimodal call over a single video's own signals (caption +
// hashtags + cover image) → industry labels. Empty result means "unknown" (don't guess) — the
// caller then falls back to the account-level ladder. This is the primary, most accurate path.
export type ContentClassifier = (input: {
  caption?: string;
  hashtags?: string[];
  imageUrl?: string;
  industries: Industry[];
}) => Promise<IndustryLabel[]>;

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
