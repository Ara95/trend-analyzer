// Domain model for the SIGNAL dashboard.
// Mirrors the engine's `trends` + `content_snapshots` tables, unified into a
// single read-friendly shape (Class A trend-feed + Class B raw-content).

export type Platform = "tiktok" | "instagram";
export type Period = "day" | "week" | "month";
export type Direction = "rising" | "falling" | "stable";
export type Format = "hashtag" | "audio" | "video" | "creator" | "reel";
export type Industry =
  | "all"
  | "beauty"
  | "fashion"
  | "food"
  | "fitness"
  | "tech"
  | "sports"
  | "entertainment"
  | "music"
  | "gaming"
  | "travel"
  | "home"
  | "family"
  | "pets"
  | "news"
  | "finance"
  | "automotive"
  | "lifestyle";
export type SourceClass = "trend-feed" | "raw-content";

/** A reel/post/video the trend points at — resolved from content_snapshots. */
export interface TrendMedia {
  externalId: string;
  caption?: string;
  /** Stable, shareable source link (Instagram/TikTok permalink). */
  permalink?: string;
  /** Cover image captured at collect time (Instagram CDN url in metrics.thumbnail). May expire. */
  thumbnail?: string;
  handle?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  capturedAt?: string;
}

/** One trend row, normalized across Class A and Class B. */
export interface TrendItem {
  id: string;
  platform: Platform;
  sourceClass: SourceClass;
  format: Format;
  /** Hashtag name, audio title, or reel id. */
  label: string;
  country: string;
  industry: Industry;
  period: Period;
  /** Normalized: Class A native `direction`, or sign of velocity for Class B. */
  direction: Direction;

  // Class A native
  rank?: number;
  rankMovement?: number;
  views?: number;

  // Class B derived
  velocityScore?: number;
  sampleSize?: number;
  sampleWindowDays?: number;

  metrics?: Record<string, unknown>;
  computedAt: string;

  /** Underlying reel/post (Class B / reels) — drives the preview. */
  media?: TrendMedia;
  /** Best outbound link for this trend (permalink, audio link, or search). */
  externalUrl?: string;
}

export interface TrendQuery {
  period: Period;
  industry: Industry;
  direction: Direction | "all";
  platform: Platform | "all";
  country: string;
}

export interface TrendDataset {
  items: TrendItem[];
  country: string;
  /** Most recent computed_at across the slice, ISO. */
  lastComputedAt?: string;
}

// ---------------------------------------------------------------------------
// Orbit search — the inspiration surface. Reads the persistent `videos` index
// (engine migration 0007), not the aggregated `trends` table.
// ---------------------------------------------------------------------------

export type SearchSort =
  | "trend"
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "engagement"
  | "recent";
/** "all" = no language filter (the index is the global corpus). */
export type SearchLang = "all" | "sv" | "en";

/** One video row from the `videos` index, shaped for the search grid. */
export interface VideoResult {
  id: string;
  platform: Platform;
  platformVideoId: string;
  creatorHandle?: string;
  caption?: string;
  hashtags: string[];
  url?: string;
  thumbnail?: string;
  postedAt?: string;
  language?: string;
  durationSeconds?: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** (likes+comments+shares)/views, 0..1. Computed at ingest. */
  engagementRate?: number;
  /** Populated by engine step 2 (creator-relative outlier). Null until then. */
  trendScore?: number;
  outlierRatio?: number;
  isBreakout: boolean;
}

export interface VideoSearchQuery {
  /** Free-text topic/keyword. Empty = browse mode (top by sort). */
  q: string;
  platform: Platform | "all";
  period: Period | "all";
  language: SearchLang;
  sort: SearchSort;
}

export interface VideoSearchResult {
  items: VideoResult[];
  query: VideoSearchQuery;
  /** True when the index is reachable but returned nothing (vs. unconfigured). */
  empty: boolean;
}
