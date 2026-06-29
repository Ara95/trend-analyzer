import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// Symmetric spike for clockworks/tiktok-scraper (the flagship). Unlike apidojo it has BOTH a real geo
// control (proxyCountryCode = TikTok serves the country's feed) AND the clockworks output shape we
// already map (so textLanguage is present and the adapter is unchanged). Confirms: (1) does
// proxyCountryCode='SE' return Swedish results, (2) is textLanguage populated, (3) the real price
// (read the run's usageTotalUsd after). Run: `npm run probe:flagship`.
const ACTOR = 'clockworks/tiktok-scraper';
const RESULTS_PER_PAGE = 10;

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);
  const input = {
    searchQueries: cfg.seSearchQueries.slice(0, 2),
    resultsPerPage: RESULTS_PER_PAGE,
    proxyCountryCode: 'SE',
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    shouldDownloadSlideshowImages: false,
  };
  console.log(`[probe:flagship] ${ACTOR} input:`, JSON.stringify(input));

  const items = (await runActor(ACTOR, input)) as Record<string, any>[];
  console.log(`[probe:flagship] returned ${items.length} items`);
  if (items.length === 0) {
    console.log('[probe:flagship] EMPTY.');
    return;
  }

  console.log('[probe:flagship] top-level keys:', Object.keys(items[0]));

  const has = (it: any, path: (o: any) => unknown) => {
    try {
      const v = path(it);
      return v !== undefined && v !== null && v !== '';
    } catch {
      return false;
    }
  };
  const fields: Record<string, (o: any) => unknown> = {
    id: (o) => o.id,
    text: (o) => o.text,
    playCount: (o) => o.playCount,
    diggCount: (o) => o.diggCount,
    commentCount: (o) => o.commentCount,
    shareCount: (o) => o.shareCount,
    handle: (o) => o.authorMeta?.name,
    createTimeISO: (o) => o.createTimeISO,
    musicId: (o) => o.musicMeta?.musicId,
    textLanguage: (o) => o.textLanguage,
    coverUrl: (o) => o.videoMeta?.coverUrl ?? o.covers?.default,
  };
  console.log('[probe:flagship] field coverage (non-empty / total):');
  for (const [name, path] of Object.entries(fields)) {
    const n = items.filter((it) => has(it, path)).length;
    console.log(`  ${name.padEnd(14)} ${n}/${items.length}`);
  }

  console.log('[probe:flagship] sample (judge if Swedish):');
  for (const it of items.slice(0, 6)) {
    console.log(`  @${it.authorMeta?.name} | lang=${it.textLanguage} | "${String(it.text ?? '').slice(0, 60)}"`);
  }
}

main().catch((err) => {
  console.error('[probe:flagship] failed:', err);
  process.exitCode = 1;
});
