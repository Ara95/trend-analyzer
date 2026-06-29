// True view velocity from a video's engagement time series (video_snapshots). The single-snapshot
// scoring pass (trendsignal.ts) can only derive a velocity PROXY (engagement / age); once a video has
// >= 2 snapshots we can measure the REAL thing: how fast views are actually climbing between its two
// most recent captures. Pure + testable; the DB plumbing lives in content/velocityPass.ts.

export interface VelocitySnapshot {
  capturedAt: string; // ISO
  views: number;
}

export interface Velocity {
  // Δviews / Δdays between the two most recent snapshots — the real per-day view growth.
  viewsPerDay: number;
  // Δviews / prior-views, as a percentage — "this video grew X% since we last saw it".
  growthPct: number;
}

// Compute velocity from a single video's snapshots. Uses the two most recent by captured_at, so it's
// robust to out-of-order input and to more than two snapshots existing. Returns null when there's
// nothing trustworthy to report: fewer than two snapshots, an unparseable/zero time delta, or
// non-finite views (a degenerate sample shouldn't fabricate a velocity).
export function computeVelocity(snapshots: VelocitySnapshot[]): Velocity | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt),
  );
  const latest = sorted[0];
  const prev = sorted[1];
  const t1 = Date.parse(latest.capturedAt);
  const t0 = Date.parse(prev.capturedAt);
  if (!Number.isFinite(t1) || !Number.isFinite(t0)) return null;
  if (!Number.isFinite(latest.views) || !Number.isFinite(prev.views)) return null;
  const days = (t1 - t0) / 86_400_000;
  if (days <= 0) return null; // same instant or out-of-order timestamps after sort guard
  const dViews = latest.views - prev.views;
  return {
    viewsPerDay: dViews / days,
    growthPct: prev.views > 0 ? (dViews / prev.views) * 100 : 0,
  };
}
