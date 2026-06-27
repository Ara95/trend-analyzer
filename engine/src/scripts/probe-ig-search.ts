import 'dotenv/config';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// Feasibility probe for an ACCOUNT-AGNOSTIC Swedish IG pipeline (no panel, works like TikTok).
// patient_discovery/instagram-search-reels does keyword CAPTION search + returns share_count, but is
// geo-blind (no country control, no language field). The fix that needs no accounts: detect Swedish
// from the caption ourselves and filter — the IG equivalent of TikTok's textLanguage gate. THE
// decisive number is YIELD: what fraction of returned reels are Swedish (= cost per kept reel). This
// probe scrapes a few Swedish keywords, applies the candidate Swedish detector, and reports yield +
// a cost projection. Cost-bounded: maxPages 1 per keyword. Usage: `npm run probe:ig-search`
const ACTOR = 'patient_discovery/instagram-search-reels';
const QUERIES = ['träning', 'inredning', 'recept']; // broad terms; the language filter does the geo work
const MAX_PAGES = 1;
const PRICE_PER_1K = 2.0; // mid of the $1.5–2.5/1k band, for the projection

// Candidate production geo gate: detect Swedish from a caption with no language field available.
// Strong Swedish markers that discriminate vs Danish/Norwegian (og/er/jeg/ikke) + German.
const SV_MARKERS = [
  ' och ', ' är ', ' jag ', ' inte ', ' från ', ' för ', ' med ', ' att ', ' den ', ' det ',
  ' som ', ' på ', ' vi ', ' du ', ' mycket ', ' även ', ' här ', ' så ', ' men ', ' kan ',
];
function isSwedish(caption: string): boolean {
  const t = ` ${caption.toLowerCase().replace(/[\n\r]+/g, ' ')} `;
  const hits = new Set(SV_MARKERS.filter((m) => t.includes(m))).size;
  const hasAao = /[åäö]/.test(t);
  // ≥2 distinct markers, OR ≥1 marker plus an å/ä/ö (cheap, tunable). Empty/emoji-only captions fail.
  return hits >= 2 || (hits >= 1 && hasAao);
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);

  const all: Record<string, any>[] = [];
  for (const query of QUERIES) {
    const raw = (await runActor(ACTOR, { query, maxPages: MAX_PAGES })) as Record<string, any>[];
    const items = raw.flatMap((o) => (Array.isArray(o.reels) ? o.reels : Array.isArray(o.posts) ? o.posts : [o]));
    const cap = (o: any) => String(o.caption?.text ?? o.caption ?? o.text ?? '');
    const swede = items.filter((it) => isSwedish(cap(it)));
    console.log(`[probe:ig-search] "${query}": ${items.length} reels -> ${swede.length} Swedish (${items.length ? Math.round((100 * swede.length) / items.length) : 0}%)`);
    for (const it of items.slice(0, 6)) {
      const c = cap(it).replace(/\s+/g, ' ');
      console.log(`    ${isSwedish(c) ? 'SV ' : '   '} @${it.user?.username ?? it.username} v=${it.ig_play_count ?? it.play_count} s=${it.share_count ?? '-'} "${c.slice(0, 48)}"`);
    }
    all.push(...items);
  }

  const cap = (o: any) => String(o.caption?.text ?? o.caption ?? o.text ?? '');
  const swedish = all.filter((it) => isSwedish(cap(it)));
  const yield_ = all.length ? swedish.length / all.length : 0;
  console.log(`\n[probe:ig-search] OVERALL: ${all.length} scraped, ${swedish.length} Swedish = ${Math.round(100 * yield_)}% yield`);
  if (yield_ > 0) {
    const scrapeFor120 = Math.ceil(120 / yield_);
    console.log(`[probe:ig-search] to KEEP 120 Swedish reels: scrape ~${scrapeFor120} -> ~$${((scrapeFor120 / 1000) * PRICE_PER_1K).toFixed(2)}/run (TikTok is $0.48)`);
  }
}

main().catch((err) => {
  console.error('[probe:ig-search] failed:', err);
  process.exitCode = 1;
});
