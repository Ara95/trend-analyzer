import type { Period } from '../adapters/contract.js';
import { DEFAULT_WEIGHTS, periodWindowDays, type Weights } from '../engine/derive.js';

// A scored piece of content from a single scrape — the content-first trend unit. No snapshots:
// the score is recency-normalized popularity (weighted engagement per day since posting), so one
// scrape yields trends immediately. `createTimeISO` gives the age; absolute metrics give engagement.
export interface ScoredContent {
  externalId: string;
  caption?: string;
  handle?: string;
  audioId?: string;
  thumbnail?: string; // video cover URL (clockworks videoMeta.coverUrl) — for the UI
  hashtags?: string[]; // native hashtags (clockworks hashtags[].name) — a content-classification signal
  language?: string; // textLanguage from the scraper (a soft geo signal)
  views: number;
  likes: number;
  comments: number;
  shares: number;
  ageDays: number;
  score: number;
  // Index fields (migration 0007). Populated from the raw scrape but not used by trend ranking; they
  // ride along so the persistent video index can store them. TikTok/clockworks populates all; the IG
  // normalizer leaves url/authorId/followerCount/durationSeconds undefined (its permalink is derivable
  // from the shortcode at display time).
  postedAt?: string; // ISO publish time (from createTimeISO) — kept instead of discarded after ageDays
  url?: string; // canonical web URL (clockworks webVideoUrl)
  authorId?: string; // stable author id (clockworks authorMeta.id)
  followerCount?: number; // author follower count (clockworks authorMeta.fans) — creator baseline input
  durationSeconds?: number; // video length (clockworks videoMeta.duration)
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

// Pull clean hashtag names from the clockworks `hashtags` array ([{ name }, ...]). Defensive: the
// shape varies and IG pre-normalizes its own array, so accept name/title/string entries.
function hashtagNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const h of v) {
    const name = typeof h === 'string' ? h : str((h as { name?: unknown })?.name) ?? str((h as { title?: unknown })?.title);
    if (name) out.push(name.replace(/^#/, '').toLowerCase());
  }
  return [...new Set(out)];
}

// A video younger than this (in days) is treated as this old, so brand-new content with huge
// engagement doesn't divide by ~0 and dominate by an artifact of timing.
const MIN_AGE_DAYS = 0.5;

export interface RankOptions {
  weights?: Weights;
  minAgeDays?: number;
  // If set, keep only items whose textLanguage is in this list (a soft geo gate). Items with no
  // detected language are treated as 'un' (undetermined), so include 'un' to keep them.
  allowedLanguages?: string[];
  // If set, drop items older than this many days. The freshness ceiling for the index ingest — so a
  // search that returns an old viral hit never persists it (matches the web read-cap and the engine's
  // indexMaxAgeDays). rankContent uses the period window instead and ignores this.
  maxAgeDays?: number;
}

// Parse one raw scraper item (clockworks flat shape) → scored content. No filtering: returns null only
// when the item is unusable (no id, or no parseable / future creation time). The period-window and
// language gates live in rankContent; the index ingest (videoRecords) wants every valid video.
function parseContent(
  raw: Record<string, any>,
  nowMs: number,
  weights: Weights,
  minAge: number,
): ScoredContent | null {
  const externalId = str(raw.id);
  if (!externalId) return null;
  const createdMs = Date.parse(raw.createTimeISO ?? '');
  if (!Number.isFinite(createdMs)) return null;
  const ageDays = (nowMs - createdMs) / 86_400_000;
  if (ageDays < 0) return null;

  const views = num(raw.playCount);
  const likes = num(raw.diggCount);
  const comments = num(raw.commentCount);
  const shares = num(raw.shareCount);
  const engagement =
    likes * weights.likes + comments * weights.comments + shares * weights.shares + views * weights.views;
  const score = engagement / Math.max(ageDays, minAge);
  const fans = raw.authorMeta?.fans;
  const duration = raw.videoMeta?.duration;

  return {
    externalId,
    caption: str(raw.text),
    handle: str(raw.authorMeta?.name)?.toLowerCase(),
    audioId: raw.musicMeta?.musicId ? String(raw.musicMeta.musicId) : undefined,
    thumbnail: str(raw.videoMeta?.coverUrl) ?? str(raw.covers?.default),
    hashtags: hashtagNames(raw.hashtags),
    language: str(raw.textLanguage),
    views, likes, comments, shares,
    ageDays,
    score,
    postedAt: new Date(createdMs).toISOString(),
    url: str(raw.webVideoUrl),
    authorId: raw.authorMeta?.id != null ? String(raw.authorMeta.id) : undefined,
    followerCount: typeof fans === 'number' && Number.isFinite(fans) ? fans : undefined,
    durationSeconds: typeof duration === 'number' && Number.isFinite(duration) ? duration : undefined,
  };
}

// Map raw scraper items (clockworks flat shape) → scored content, keeping only items posted within
// the period window, ranked by recency-normalized engagement (highest first). Deduped by externalId
// (the same video can surface under several queries/hashtags).
export function rankContent(
  items: Record<string, any>[],
  nowMs: number,
  period: Period,
  opts: RankOptions = {},
): ScoredContent[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const minAge = opts.minAgeDays ?? MIN_AGE_DAYS;
  const windowDays = periodWindowDays(period);

  const byId = new Map<string, ScoredContent>();
  for (const raw of items) {
    const externalId = str(raw.id);
    if (!externalId || byId.has(externalId)) continue;
    const parsed = parseContent(raw, nowMs, weights, minAge);
    if (!parsed) continue;
    if (parsed.ageDays > windowDays) continue; // outside the period window
    if (opts.allowedLanguages && opts.allowedLanguages.length > 0) {
      if (!opts.allowedLanguages.includes(parsed.language ?? 'un')) continue; // geo gate
    }
    byId.set(externalId, parsed);
  }

  return [...byId.values()].sort((a, b) => b.score - a.score);
}

// Map raw scraper items → the canonical video records for the persistent index. Unlike rankContent
// this applies NO period window and NO language gate — the index is the global corpus; period and
// language are stored columns filtered at query time. Deduped by externalId; order is not significant
// (the caller sorts/scores). One row per distinct video across the whole scrape.
export function videoRecords(
  items: Record<string, any>[],
  nowMs: number,
  opts: Pick<RankOptions, 'weights' | 'minAgeDays' | 'maxAgeDays'> = {},
): ScoredContent[] {
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const minAge = opts.minAgeDays ?? MIN_AGE_DAYS;
  const byId = new Map<string, ScoredContent>();
  for (const raw of items) {
    const externalId = str(raw.id);
    if (!externalId || byId.has(externalId)) continue;
    const parsed = parseContent(raw, nowMs, weights, minAge);
    if (!parsed) continue;
    if (opts.maxAgeDays != null && parsed.ageDays > opts.maxAgeDays) continue; // freshness ceiling
    byId.set(externalId, parsed);
  }
  return [...byId.values()];
}
