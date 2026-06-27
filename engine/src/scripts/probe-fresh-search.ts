import 'dotenv/config';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// Confirms the on-demand search freshness lever (Layer 2): does clockworks/tiktok-scraper actually honor
// videoSearchDateFilter='PAST_MONTH' (+ searchSection='/video'), and what is the default sort? We rely
// on the default being MOST_RELEVANT, so we print BOTH the age distribution of createTimeISO (every item
// should be <= ~30 days) AND the first captions/handles (to eyeball that it's relevance, not LATEST).
// One small paid run. Run: `npm run probe:fresh-search [term]`.
const TERM = process.argv[2] ?? 'iphone tips';
const RESULTS_PER_PAGE = 14;

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);
  const input = {
    searchQueries: [TERM],
    searchSection: '/video',
    videoSearchDateFilter: 'PAST_MONTH',
    resultsPerPage: RESULTS_PER_PAGE,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };
  console.log(`[probe:fresh-search] term="${TERM}" input:`, JSON.stringify(input));

  const items = (await runActor(cfg.tiktokActorId, input)) as Record<string, any>[];
  console.log(`[probe:fresh-search] returned ${items.length} items`);
  if (items.length === 0) {
    console.log('[probe:fresh-search] EMPTY — date filter may be too narrow, or the param was rejected.');
    return;
  }

  const now = Date.now();
  const ages: number[] = [];
  let undated = 0;
  let over30 = 0;
  for (const it of items) {
    const ms = Date.parse(it.createTimeISO ?? '');
    if (!Number.isFinite(ms)) {
      undated++;
      continue;
    }
    const ageDays = (now - ms) / 86_400_000;
    ages.push(ageDays);
    if (ageDays > 30) over30++;
  }
  ages.sort((a, b) => a - b);
  const max = ages.length ? ages[ages.length - 1] : 0;
  const median = ages.length ? ages[Math.floor(ages.length / 2)] : 0;

  console.log('[probe:fresh-search] AGE (days since posted):');
  console.log(`  dated ${ages.length}/${items.length} · undated ${undated} · median ${median.toFixed(1)} · max ${max.toFixed(1)} · >30d: ${over30}`);
  console.log(
    over30 === 0
      ? '  ✅ PAST_MONTH honored — every dated item is within 30 days.'
      : `  ⚠️  ${over30} item(s) older than 30 days — the date filter is NOT bounding to ~30d.`,
  );

  console.log('[probe:fresh-search] first items in returned order (judge relevance vs recency):');
  for (const it of items.slice(0, 8)) {
    const ms = Date.parse(it.createTimeISO ?? '');
    const age = Number.isFinite(ms) ? `${((now - ms) / 86_400_000).toFixed(1)}d` : '??';
    console.log(`  ${age.padStart(6)} | @${it.authorMeta?.name} | "${String(it.text ?? '').slice(0, 60)}"`);
  }
}

main().catch((err) => {
  console.error('[probe:fresh-search] failed:', err);
  process.exitCode = 1;
});
