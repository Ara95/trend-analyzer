import type { SearchSort, SearchLang, VideoSearchQuery } from "./types";
import type { Period, Platform } from "./types";

// URL <-> VideoSearchQuery for the Orbit search surface. Mirrors lib/query.ts (the dashboard's
// parser) but for /search. Defaults are omitted from the href so shared links stay clean.

const SORT_VALUES: SearchSort[] = [
  "trend",
  "views",
  "likes",
  "comments",
  "shares",
  "engagement",
  "recent",
];
const LANG_VALUES: SearchLang[] = ["all", "sv", "en"];
const PERIOD_VALUES: (Period | "all")[] = ["all", "day", "week", "month"];
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

export function parseSearchQuery(sp: SearchParams): VideoSearchQuery {
  return {
    q: text(sp.q),
    platform: pick(sp.platform, PLATFORM_VALUES, "all"),
    period: pick(sp.period, PERIOD_VALUES, "all"),
    language: pick(sp.lang, LANG_VALUES, "all"),
    sort: pick(sp.sort, SORT_VALUES, "trend"),
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
  if (merged.period !== "all") params.set("period", merged.period);
  if (merged.language !== "all") params.set("lang", merged.language);
  if (merged.sort !== "trend") params.set("sort", merged.sort);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}