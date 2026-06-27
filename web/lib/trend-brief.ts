import type { Platform, VideoResult } from "./types";
import { PLATFORM_LABELS } from "./constants";

/**
 * Aggregates a search result set into a small "intelligence report" for the trend brief panel.
 *
 * Everything here is derived from the videos actually returned — no external data source. Where the
 * data genuinely can't support a figure (no week-over-week history for a precise momentum %, no NLP
 * for hooks), we degrade to an honest qualitative signal or omit the tile rather than fabricate a
 * number. Callers should treat a `null` field as "not available, hide it".
 */

export interface BriefStat {
  label: string;
  value: string;
  /** When set, render the value in the signal accent (a positive/heat reading). */
  accent?: boolean;
}

export interface TrendBrief {
  q: string;
  count: number;
  stats: BriefStat[];
  hooks: { text: string; count: number }[];
}

const scoreFmt = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Peak posting window by total views across the result set — a real "best time" signal when posts
// carry timestamps. Returns e.g. "07–09" (a 2h window), or null if too few timestamps to be useful.
function bestWindow(items: VideoResult[]): string | null {
  const byHour = new Array<number>(24).fill(0);
  let dated = 0;
  for (const v of items) {
    if (!v.postedAt) continue;
    const h = new Date(v.postedAt).getHours();
    if (Number.isNaN(h)) continue;
    byHour[h] += v.views || 1;
    dated++;
  }
  if (dated < 4) return null;
  let peak = 0;
  for (let h = 1; h < 24; h++) if (byHour[h] > byHour[peak]) peak = h;
  return `${pad(peak)}–${pad((peak + 2) % 24)}`;
}

// Hooks the data can actually see: caption-pattern matches with real per-video counts. v1 stand-in
// until proper NLP exists — only patterns hit by ≥2 videos surface, so noise stays out.
const HOOK_PATTERNS: { test: RegExp; label: string }[] = [
  { test: /\bpov\b/i, label: "POV: …" },
  { test: /\b\d+\s+(saker|sätt|tips|misstag|skäl|knep)\b/i, label: "«N saker …»" },
  { test: /\bså här\b/i, label: "«Så här …»" },
  { test: /\bdärför\b/i, label: "«Därför …»" },
  { test: /\?\s*$/, label: "Frågor" },
];

function deriveHooks(items: VideoResult[]): { text: string; count: number }[] {
  const counts = HOOK_PATTERNS.map((p) => ({
    text: p.label,
    count: items.filter((v) => v.caption && p.test.test(v.caption)).length,
  }));
  return counts
    .filter((h) => h.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

export function summarizeSearch(q: string, items: VideoResult[]): TrendBrief {
  const stats: BriefStat[] = [];

  // Momentum — qualitative direction from breakout/outlier density (no w/w history for a precise %).
  const hot = items.filter(
    (v) => v.isBreakout || (v.outlierRatio != null && v.outlierRatio >= 1.5),
  ).length;
  const ratio = items.length ? hot / items.length : 0;
  const momentum =
    ratio >= 0.25
      ? { value: "Stigande ▲", accent: true }
      : ratio >= 0.1
        ? { value: "Stabil", accent: false }
        : { value: "Lugnt", accent: false };
  stats.push({ label: "Momentum", value: momentum.value, accent: momentum.accent });

  // Average Trend Score across the scored videos.
  const scored = items.filter((v) => v.trendScore != null);
  if (scored.length) {
    const avg = scored.reduce((s, v) => s + (v.trendScore ?? 0), 0) / scored.length;
    stats.push({ label: "Snitt Trend Score", value: `${scoreFmt.format(avg)} / 10` });
  }

  // Breakouts in the set.
  const breakouts = items.filter((v) => v.isBreakout).length;
  if (breakouts > 0) {
    stats.push({ label: "Breakouts", value: `${breakouts} nya`, accent: true });
  }

  // Top platform share.
  if (items.length) {
    const byPlatform = new Map<Platform, number>();
    for (const v of items) byPlatform.set(v.platform, (byPlatform.get(v.platform) ?? 0) + 1);
    const [top, n] = [...byPlatform.entries()].sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round((n / items.length) * 100);
    stats.push({ label: "Topplattform", value: `${PLATFORM_LABELS[top]} · ${pct}%` });
  }

  // Best posting window.
  const win = bestWindow(items);
  if (win) stats.push({ label: "Bästa tid", value: win });

  return { q, count: items.length, stats, hooks: deriveHooks(items) };
}
