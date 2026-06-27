import 'dotenv/config'; // load .env before loadEnv() reads it
import { loadEnv } from '../config/env.js';
import { createSupabase } from '../store/supabase.js';
import { scoreTrends, type TrendItem } from '../content/trendsignal.js';

// Recompute the trend signal (B robust cohort z + D virality) over the trends ALREADY stored — no
// scraping, no Apify cost. Use to backfill data that predates the signal, or to re-tune the cutoff
// against real data. Each period is its own cohort. Run: `npm run rescore`.
//
// NOTE on meaning: rescore's cohort is the STORED trends (the top-N kept per run, possibly across
// several runs) — a subset of the original scrape, which is not persisted. So these z-scores are
// "outlier among stored trends" and can differ from collect's "outlier among the full scrape".
// For canonical scores, re-run `npm run collect`. rescore is a backfill / cutoff-tuning tool.
type Row = {
  id: string;
  period: string;
  label: string;
  velocity_score: number | null;
  views: number | null;
  metrics: Record<string, any> | null;
};

function percentile(sortedDesc: number[], p: number): number {
  if (sortedDesc.length === 0) return 0;
  const idx = Math.min(sortedDesc.length - 1, Math.floor((1 - p) * sortedDesc.length));
  return sortedDesc[idx];
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const supabase = createSupabase(cfg);

  const { data, error } = await supabase
    .from('trends')
    .select('id,period,label,velocity_score,views,metrics')
    .eq('format', 'video');
  if (error) throw new Error(`read trends failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    console.log('[rescore] no video trends stored — nothing to do');
    return;
  }

  const byPeriod = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byPeriod.get(r.period) ?? [];
    arr.push(r);
    byPeriod.set(r.period, arr);
  }

  let updated = 0;
  for (const [period, group] of byPeriod) {
    const toItem = (r: Row): TrendItem => ({
      score: r.velocity_score ?? 0,
      views: r.views ?? 0,
      likes: Number(r.metrics?.likes ?? 0),
      comments: Number(r.metrics?.comments ?? 0),
      shares: Number(r.metrics?.shares ?? 0),
    });
    const items = group.map(toItem);

    // Dedupe the baseline by label: the same video can be stored under multiple industries (the
    // unique key includes industry), which would otherwise double-count it in the cohort stats.
    const seen = new Set<string>();
    const baseline: TrendItem[] = [];
    for (const r of group) {
      if (seen.has(r.label)) continue;
      seen.add(r.label);
      baseline.push(toItem(r));
    }

    const signals = scoreTrends(items, {
      breakoutZ: cfg.trendBreakoutZ,
      minViralityViews: cfg.trendMinViralityViews,
      baseline,
    });

    // How many would cross at a few cutoffs — so the cutoff can be tuned against this real cohort.
    const z = signals.map((s) => s.trendScore).sort((a, b) => b - a);
    const atLeast = (t: number) => z.filter((v) => v >= t).length;
    // Views distribution (deduped) — to sanity-check / tune TREND_MIN_VIRALITY_VIEWS.
    const viewsDesc = baseline.map((it) => it.views).sort((a, b) => b - a);
    let breakouts = 0;
    for (let i = 0; i < group.length; i++) {
      const r = group[i];
      const sig = signals[i];
      if (sig.isBreakout) breakouts++;
      const { error: upErr } = await supabase
        .from('trends')
        .update({
          trend_score: sig.trendScore,
          is_breakout: sig.isBreakout,
          metrics: {
            ...(r.metrics ?? {}),
            velocityZ: sig.velocityZ,
            viralityZ: sig.viralityZ,
            viralityEligible: sig.viralityEligible,
            shareRate: sig.virality.shareRate,
            commentRate: sig.virality.commentRate,
            engagementRate: sig.virality.engagementRate,
          },
        })
        .eq('id', r.id);
      if (upErr) throw new Error(`update ${r.id} failed: ${upErr.message}`);
      updated++;
    }
    console.log(
      `[rescore] ${period}: ${group.length} rows (${baseline.length} unique), ${breakouts} breakout ` +
        `(z>=${cfg.trendBreakoutZ}) | crossing z>=2.5:${atLeast(2.5)} z>=3.0:${atLeast(3.0)} z>=3.5:${atLeast(3.5)} | ` +
        `top z=${(z[0] ?? 0).toFixed(2)}`,
    );
    console.log(
      `[rescore] ${period} views: p90=${percentile(viewsDesc, 0.9).toLocaleString()} ` +
        `p50=${percentile(viewsDesc, 0.5).toLocaleString()} p10=${percentile(viewsDesc, 0.1).toLocaleString()} ` +
        `(virality floor=${cfg.trendMinViralityViews.toLocaleString()})`,
    );
  }
  console.log(`[rescore] updated ${updated} trend(s)`);
}

main().catch((err) => {
  console.error('[rescore] failed:', err);
  process.exitCode = 1;
});
