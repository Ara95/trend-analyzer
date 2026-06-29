import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';
import { flattenReels, normalizeInstagramReels } from '../content/instagram.js';

// Does fetching MORE pages from the keyword-search actor buy us FRESHER reels (so Day/Week populate),
// or just more of the same weeks-old content? The actor ranks by relevance/popularity, not recency,
// so this is an open empirical question. Probe: fetch maxPages=1 vs 3 for a couple keywords and
// compare the post-age distribution. Decisive before scaling cost. Usage: `npm run probe:ig-fresh`
const ACTOR_DEFAULT = 'patient_discovery/instagram-search-reels';
const QUERIES = ['träning', 'inredning'];

async function ageStats(actor: string, runActor: ReturnType<typeof createApify>, query: string, maxPages: number) {
  const raw = (await runActor(actor, { query, maxPages })) as Record<string, any>[];
  const items = normalizeInstagramReels(flattenReels(raw)).filter((it) => it.textLanguage === 'sv');
  const now = Date.now();
  const ages = items
    .map((it) => (now - Date.parse(it.createTimeISO)) / 86_400_000)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const le = (d: number) => ages.filter((a) => a <= d).length;
  return {
    n: items.length,
    swedishAged: ages.length,
    d1: le(1),
    d7: le(7),
    d30: le(30),
    median: ages.length ? ages[Math.floor(ages.length / 2)] : NaN,
    youngest: ages[0],
  };
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);
  const actor = cfg.igSearchActorId || ACTOR_DEFAULT;

  for (const query of QUERIES) {
    for (const maxPages of [1, 3]) {
      const s = await ageStats(actor, runActor, query, maxPages);
      console.log(
        `[probe:ig-fresh] "${query}" maxPages=${maxPages}: ${s.swedishAged} Swedish | ≤1d ${s.d1} · ≤7d ${s.d7} · ≤30d ${s.d30} | youngest ${s.youngest?.toFixed(1)}d · median ${Number.isFinite(s.median) ? s.median.toFixed(1) : '-'}d`,
      );
    }
  }
  console.log('[probe:ig-fresh] If ≤7d barely rises from maxPages 1→3, pagination does NOT buy freshness.');
}

main().catch((err) => {
  console.error('[probe:ig-fresh] failed:', err);
  process.exitCode = 1;
});
