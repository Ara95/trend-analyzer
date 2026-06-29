import type { SearchSort, SearchLang, VideoSearchQuery } from "./types";
import type { Period, Platform } from "./types";

// URL <-> VideoSearchQuery for the Orbit search surface. Mirrors lib/query.ts (the dashboard's
// parser) but for /search. Defaults are omitted from the href so shared links stay clean.

const SORT_VALUES: SearchSort[] = [
  "trend",
  "outlier",
  "views",
  "likes",
  "comments",
  "shares",
  "engagement",
  "recent",
];
/** Allowed outlier-threshold tiers (×creator average). 0 = no filter. Keep in sync with constants. */
const OUTLIER_VALUES = [0, 2, 5, 10, 20] as const;
const LANG_VALUES: SearchLang[] = ["all", "sv", "en"];
const PERIOD_VALUES: Period[] = ["day", "week", "month"];
const PLATFORM_VALUES: (Platform | "all")[] = ["all", "instagram", "tiktok"];

export type SearchParams = Record<string, string | string[] | undefined>;

function pick<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function text(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().slice(0, 120);
}

function outlier(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (OUTLIER_VALUES as readonly number[]).includes(value) ? value : 0;
}

export function parseSearchQuery(sp: SearchParams): VideoSearchQuery {
  return {
    q: text(sp.q),
    platform: pick(sp.platform, PLATFORM_VALUES, "all"),
    period: pick(sp.period, PERIOD_VALUES, "month"),
    language: pick(sp.lang, LANG_VALUES, "all"),
    sort: pick(sp.sort, SORT_VALUES, "trend"),
    minOutlier: outlier(sp.outlier),
  };
}

/** Build a /search href from the current query plus a patch — defaults omitted. */
export function buildSearchHref(
  current: VideoSearchQuery,
  patch: Partial<VideoSearchQuery> = {},
): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.platform !== "all") params.set("platform", merged.platform);
  if (merged.period !== "month") params.set("period", merged.period);
  if (merged.language !== "all") params.set("lang", merged.language);
  if (merged.sort !== "trend") params.set("sort", merged.sort);
  if (merged.minOutlier > 0) params.set("outlier", String(merged.minOutlier));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}