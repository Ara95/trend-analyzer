import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// One-off verification spike for apidojo/tiktok-scraper before adopting it (16x cheaper than the
// current clockworks actor). Confirms the two things we CANNOT know from the README alone:
//   1. Does location=SE actually return Swedish results? (an earlier `location=SE → noResults` needs
//      re-testing — our geo strategy is keyword + ISO country, not the old param.)
//   2. Does its output carry the fields our pipeline needs (under apidojo's own names)?
// Cost: maxItems below × $0.0003. At 20 items ≈ $0.006. Run: `npm run probe:apidojo`.
const ACTOR = 'apidojo/tiktok-scraper';
const MAX_ITEMS = 20;

// apidojo output names → what our pipeline needs (clockworks names in parentheses).
function coverage(it: Record<string, any>): Record<string, unknown> {
  return {
    externalId: it.id, // (id)
    caption: it.title, // (text)
    views: it.views, // (playCount)
    likes: it.likes, // (diggCount)
    comments: it.comments, // (commentCount)
    shares: it.shares, // (shareCount)
    handle: it.channel?.username ?? it.channel?.name, // (authorMeta.name)
    createdISO: it.uploadedAtFormatted, // (createTimeISO)
    audioId: it.song?.id, // (musicMeta.musicId)
    thumbnail: it.video?.cover ?? it.video?.thumbnail, // (NOT in clockworks — bonus, web gap)
    language: it.language_code ?? it.lang ?? it.textLanguage, // geo fallback if location is weak
    region: it.region ?? it.locationCreated,
  };
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);
  const input = { keywords: cfg.seSearchQueries.slice(0, 2), location: 'SE', maxItems: MAX_ITEMS };
  console.log(`[probe] ${ACTOR} input:`, JSON.stringify(input));

  const items = (await runActor(ACTOR, input)) as Record<string, any>[];
  console.log(`[probe] returned ${items.length} items (cost ≈ $${(items.length * 0.0003).toFixed(4)})`);
  if (items.length === 0) {
    console.log('[probe] EMPTY — location=SE + keyword search returned nothing. Geo via this actor is unproven.');
    return;
  }

  // Field coverage across the batch: how many items have each field non-empty.
  const keys = Object.keys(coverage(items[0]));
  const counts: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const it of items) {
    const cov = coverage(it);
    for (const k of keys) {
      const v = (cov as any)[k];
      if (v !== undefined && v !== null && v !== '') counts[k]++;
    }
  }
  console.log('[probe] field coverage (non-empty / total):');
  for (const k of keys) console.log(`  ${k.padEnd(12)} ${counts[k]}/${items.length}`);

  // Eyeball Swedishness: print a few captions + handles so a human can judge geo quality.
  console.log('[probe] sample (judge if these look Swedish):');
  for (const it of items.slice(0, 5)) {
    const c = coverage(it);
    console.log(`  @${c.handle} | lang=${c.language} | "${String(c.caption ?? '').slice(0, 70)}"`);
  }
}

main().catch((err) => {
  console.error('[probe] failed:', err);
  process.exitCode = 1;
});
