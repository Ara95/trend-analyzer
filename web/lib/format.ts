import type { Platform, TrendItem } from "./types";

const compact = new Intl.NumberFormat("sv-SE", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const full = new Intl.NumberFormat("sv-SE");

/** "1,2 mn", "324 tn" — Swedish compact notation. */
export function formatCompact(n: number | undefined | null): string {
  if (n == null) return "–";
  return compact.format(n);
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null) return "–";
  return full.format(n);
}

const pct = new Intl.NumberFormat("sv-SE", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Engagement rate 0..1 → "8,4 %". */
export function formatPercent(n: number | undefined | null): string {
  if (n == null) return "–";
  return pct.format(n);
}

/** Signed velocity, e.g. "+18,4" / "−6,1". */
export function formatVelocity(n: number | undefined | null): string {
  if (n == null) return "–";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "±";
  return `${sign}${compact.format(Math.abs(n))}`;
}

/**
 * A single normalized "movement" figure used for sorting and the momentum bar.
 * Class A → rank movement; Class B → velocity score.
 */
export function momentum(item: TrendItem): number {
  if (item.velocityScore != null) return item.velocityScore;
  if (item.rankMovement != null) return item.rankMovement;
  return 0;
}

export function truncate(s: string, max: number): string {
  // Iterate by code point (Array.from), NOT by UTF-16 code unit (.slice/.length): a raw .slice can cut
  // through the middle of a surrogate-pair emoji (🐴, 🔥, …), leaving a lone surrogate that React
  // serializes differently on the server and the client → a hydration mismatch (the "…☀️�…" crash).
  const chars = Array.from(s);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : s;
}

/**
 * Human headline for a trend. Reel labels are raw shortcodes, so prefer the
 * caption (the substance of what's trending), then the creator handle.
 */
export function displayHeadline(item: TrendItem, max = 60): string {
  if (item.format === "hashtag") return `#${item.label}`;
  if (item.format === "audio") return item.label;
  const caption = item.media?.caption;
  if (caption) return truncate(caption, max);
  if (item.media?.handle) return `@${item.media.handle}`;
  return item.label;
}

/** Signed movement chip text: velocity for Class B, rank delta for Class A. */
export function movementLabel(item: TrendItem): string | undefined {
  if (item.velocityScore != null) return formatVelocity(item.velocityScore);
  if (item.rankMovement != null) {
    const m = item.rankMovement;
    return m > 0 ? `+${m}` : m < 0 ? `−${Math.abs(m)}` : "±0";
  }
  return undefined;
}

const rtf = new Intl.RelativeTimeFormat("sv-SE", { numeric: "auto" });

export function relativeTime(iso?: string, now: number = Date.now()): string {
  if (!iso) return "okänt";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "okänt";
  const diffMin = Math.round((then - now) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 60) return rtf.format(diffMin, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diffMin / 60), "hour");
  return rtf.format(Math.round(diffMin / 1440), "day");
}

/** Looks like an Instagram shortcode (not an all-numeric internal id). */
function isShortCode(id: string): boolean {
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) && /[A-Za-z_-]/.test(id);
}

export function instagramPermalink(externalId: string): string | undefined {
  if (isShortCode(externalId)) {
    return `https://www.instagram.com/reel/${externalId}/`;
  }
  return undefined;
}

export function hashtagUrl(platform: Platform, tag: string): string {
  const clean = tag.replace(/^#/, "");
  return platform === "tiktok"
    ? `https://www.tiktok.com/tag/${encodeURIComponent(clean)}`
    : `https://www.instagram.com/explore/tags/${encodeURIComponent(clean)}/`;
}

export function tiktokVideoUrl(handle: string, id: string): string {
  return `https://www.tiktok.com/@${handle.replace(/^@/, "")}/video/${id}`;
}

/** TikTok music pages resolve by id; the slug part is ignored. */
export function tiktokMusicUrl(id: string): string {
  return `https://www.tiktok.com/music/audio-${id}`;
}

function handleOf(item: TrendItem): string | undefined {
  if (item.media?.handle) return item.media.handle;
  const h = item.metrics?.["handle"];
  return typeof h === "string" ? h : undefined;
}

/**
 * Resolve the best *stable* outbound link for a trend.
 *  - reel/raw-content → Instagram permalink (from shortcode)
 *  - audio            → audioLink from metrics (TikTok sound page)
 *  - hashtag          → platform hashtag page
 */
export function resolveExternalUrl(item: TrendItem): string | undefined {
  if (item.media?.permalink) return item.media.permalink;

  if (item.format === "hashtag") {
    return hashtagUrl(item.platform, item.label);
  }
  if (item.format === "audio") {
    const link = item.metrics?.["audioLink"];
    if (typeof link === "string" && link) return link;
    if (item.platform === "tiktok") return tiktokMusicUrl(item.label);
  }

  // video / reel — point at the creator's post on the source platform
  const externalId = item.media?.externalId ?? item.label;
  const handle = handleOf(item);
  if (item.platform === "tiktok" && handle) {
    return tiktokVideoUrl(handle, externalId);
  }
  if (item.platform === "instagram") {
    return instagramPermalink(externalId);
  }
  return undefined;
}
