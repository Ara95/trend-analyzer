import 'dotenv/config';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// Decision probe for switching the ON-DEMAND IG search path to apidojo/instagram-scraper (it has a
// `until` date filter the current caption-search actor lacks → real freshness control + ~3-5x cheaper).
// apidojo searches by URL (hashtag/profile/location), NOT free-text caption — so a user term must become
// a hashtag. This probe answers the four things we CANNOT know from the README, and that gate whether
// the switch is worth wiring:
//
//   1. PREMISE — does collapsing a multi-word term to ONE hashtag return reels at all? Our real queries
//      are mostly multi-word ("budget recept", "AI-verktyg"); "budget recept" → #budgetrecept is a tiny
//      tag next to the huge #recept. We test the concatenated tag AND a single-salient-token fallback so
//      the damage is measurable, not guessed. apidojo has NO caption search to fall back on.
//   2. SHORTCODE — does each reel carry a usable shortcode (6-20 chars, contains a non-digit)? The web
//      builds the IG permalink from it (instagramPermalink/isShortCode). If apidojo only exposes a
//      numeric id/pk, every IG card renders link-less — a silent degradation. DECISIVE.
//   3. SCHEMA — the exact output field names (apidojo's own), and whether reels actually carry view/play
//      counts. We dump raw keys + probe defensive candidate paths so we can write the normalizer against
//      real data, not a guess.
//   4. FRESHNESS — under a single `until = now-30d` call, what's the age spread (≤1d/≤7d/≤30d) and is it
//      newest-first? If ≤7d is already well populated, one call suffices; if not, we'd need TikTok-style
//      tiers (until=1d/7d/30d). Decides tiered-vs-single before we commit the cost.
//
// Cost-bounded: MAX_ITEMS per call, a handful of queries × 2 tag variants. apidojo ≈ $0.0005/item, so
// ~160 items ≈ $0.08. Run: `npm run probe:apidojo-ig`. Override actor via IG_APIDOJO_ACTOR_ID.

const ACTOR = process.env.IG_APIDOJO_ACTOR_ID ?? 'apidojo/instagram-scraper';
const MAX_ITEMS = 15;
const WINDOW_DAYS = 30;
const PRICE_PER_1K = 0.5;

// Representative of the web's EXAMPLE_QUERIES — deliberately multi-word (the worst case for the
// hashtag collapse) plus one single-word control.
const QUERIES = ['budget recept', 'träning hemma', 'gaming setup', 'morgonrutin', 'träning'];

// term → ONE hashtag tag: lowercase, keep unicode letters/digits/underscore (so åäö survive), drop
// spaces & punctuation. "budget recept" → "budgetrecept", "AI-verktyg" → "aiverktyg".
function tagConcat(term: string): string {
  return term.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, '');
}
// Single-salient-token fallback: the longest word (tie → last). "budget recept" → "recept": more
// volume, less precision. The probe measures whether this recovers the reels the concat tag loses.
function tagSalient(term: string): string {
  const words = term.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  if (words.length === 0) return tagConcat(term);
  return words.reduce((a, b) => (b.length >= a.length ? b : a));
}
function tagUrl(tag: string): string {
  return `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}`;
}
function untilDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// Defensive candidate paths for each field our pipeline needs — apidojo's real names are unknown, so we
// probe several and report which one actually carries data (that's how we learn the schema).
function firstDefined(...vals: unknown[]): unknown {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v;
  return undefined;
}
function coverage(it: Record<string, any>): Record<string, unknown> {
  return {
    shortCode: firstDefined(it.shortCode, it.code, it.short_code, it.shortcode),
    numericId: firstDefined(it.id, it.pk),
    caption: firstDefined(it.caption?.text, typeof it.caption === 'string' ? it.caption : undefined, it.text),
    views: firstDefined(it.videoPlayCount, it.videoViewCount, it.playCount, it.viewCount, it.views, it.ig_play_count, it.play_count),
    likes: firstDefined(it.likesCount, it.likeCount, it.likes, it.like_count),
    comments: firstDefined(it.commentsCount, it.commentCount, it.comments, it.comment_count),
    shares: firstDefined(it.sharesCount, it.reshareCount, it.shareCount, it.share_count),
    handle: firstDefined(it.ownerUsername, it.username, it.user?.username, it.owner?.username),
    timestamp: firstDefined(it.timestamp, it.createdAt, it.takenAt, it.taken_at, it.createTime),
    thumbnail: firstDefined(it.displayUrl, it.thumbnailUrl, it.thumbnail, it.displayUri, it.image_versions2?.candidates?.[0]?.url),
    audioId: firstDefined(it.musicInfo?.audio_id, it.clips_metadata?.music_info?.music_asset_info?.id),
  };
}

function looksLikeShortcode(v: unknown): boolean {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{6,20}$/.test(v) && /[A-Za-z_-]/.test(v);
}

// Parse whatever timestamp shape into epoch ms (apidojo may give ISO, unix seconds, or unix ms).
function toMs(v: unknown): number {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000; // seconds vs ms
  if (typeof v === 'string') {
    const iso = Date.parse(v);
    if (Number.isFinite(iso)) return iso;
    const n = Number(v);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  return NaN;
}

async function scrape(runActor: ReturnType<typeof createApify>, tag: string): Promise<Record<string, any>[]> {
  const input = { startUrls: [tagUrl(tag)], until: untilDate(WINDOW_DAYS), maxItems: MAX_ITEMS };
  const items = (await runActor(ACTOR, input)) as Record<string, any>[];
  return Array.isArray(items) ? items : [];
}

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);
  console.log(`[probe:apidojo-ig] actor=${ACTOR}  until=${untilDate(WINDOW_DAYS)} (≤${WINDOW_DAYS}d)  maxItems=${MAX_ITEMS}\n`);

  let total = 0;
  let firstSample: Record<string, any> | undefined;

  // 1+2. PREMISE & SHORTCODE: concat tag vs salient-token, reel counts + shortcode usability.
  for (const term of QUERIES) {
    const concat = tagConcat(term);
    const salient = tagSalient(term);
    const sameTag = concat === salient;

    const concatItems = await scrape(runActor, concat);
    total += concatItems.length;
    if (!firstSample && concatItems[0]) firstSample = concatItems[0];

    const scOk = concatItems.filter((it) => looksLikeShortcode(coverage(it).shortCode)).length;
    let line = `[premise] "${term}"  #${concat}: ${concatItems.length} reels (${scOk} w/ usable shortcode)`;

    if (!sameTag) {
      const salientItems = await scrape(runActor, salient);
      total += salientItems.length;
      line += `   vs  #${salient}: ${salientItems.length} reels`;
    } else {
      line += `   (single-word — no salient fallback)`;
    }
    console.log(line);
  }

  if (!firstSample) {
    console.log('\n[probe:apidojo-ig] EMPTY across all tags — hashtag search via this actor returned nothing. Premise FAILS.');
    return;
  }

  // 3. SCHEMA: dump the raw top-level keys (ground truth) + which defensive path carried data.
  console.log('\n[schema] raw top-level keys of first reel:');
  console.log('  ', Object.keys(firstSample).join(', '));
  console.log('[schema] resolved coverage (which candidate path had data) for first reel:');
  const cov = coverage(firstSample);
  for (const [k, v] of Object.entries(cov)) {
    const shown = typeof v === 'string' ? `"${v.slice(0, 48)}"` : v;
    console.log(`   ${k.padEnd(11)} ${v === undefined ? '— MISSING' : shown}`);
  }

  // 4. FRESHNESS: age spread of the LARGEST single-tag result we can cheaply re-pull (reuse 'träning').
  const freshItems = await scrape(runActor, 'träning');
  const now = Date.now();
  const ages = freshItems
    .map((it) => (now - toMs(coverage(it).timestamp)) / 86_400_000)
    .filter((n) => Number.isFinite(n) && n >= 0);
  const le = (d: number) => ages.filter((a) => a <= d).length;
  const newestFirst = ages.length >= 2 ? ages[0] <= ages[ages.length - 1] : undefined;
  console.log(
    `\n[freshness] #träning (until=${untilDate(WINDOW_DAYS)}): ${ages.length}/${freshItems.length} dated | ≤1d ${le(1)} · ≤7d ${le(7)} · ≤30d ${le(30)} | order ${newestFirst === undefined ? '?' : newestFirst ? 'newest-first ✓ (single until call enough)' : 'NOT newest-first (may need 1d/7d/30d tiers)'}`,
  );

  console.log(`\n[probe:apidojo-ig] ${total} items total ≈ $${((total / 1000) * PRICE_PER_1K).toFixed(4)}.`);
  console.log('[probe:apidojo-ig] VERDICT inputs → premise: do concat tags return reels? shortcode: usable for permalinks? schema: which fields carry data? freshness: ≤7d populated?');
}

main().catch((err) => {
  console.error('[probe:apidojo-ig] failed:', err);
  process.exitCode = 1;
});
