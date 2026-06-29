import '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createApify } from '../store/apify.js';

// Verification spike for the Instagram flagship actor (apify/instagram-scraper). Instagram has NO
// "browse as Sweden" proxy feed like TikTok's proxyCountryCode — its only genuine geo surface is
// LOCATION / place pages (posts geotagged at a Swedish place). This probe confirms, on real data
// BEFORE we wire anything: (1) does a place search for Sweden return posts, (2) which fields exist
// (views, likes, comments, caption, timestamp, owner, thumbnail, type) and which DON'T (shares,
// language), (3) the real price (read the run's cost in the Apify console after). Run cheap.
// Usage: `npm run probe:instagram`
const ACTOR = 'apify/instagram-scraper';
const RESULTS_LIMIT = 15; // hard cap on pay-per-result cost

async function main(): Promise<void> {
  const cfg = loadEnv();
  const runActor = createApify(cfg.apifyToken);

  // searchType 'place' = Instagram location pages. searchLimit 1 = take the top place match for the
  // term, then resultsLimit posts from it. resultsType 'posts' yields reels+photos (type tells which).
  const input = {
    search: 'Sweden',
    searchType: 'place',
    searchLimit: 1,
    resultsType: 'posts',
    resultsLimit: RESULTS_LIMIT,
    addParentData: false,
  };
  console.log(`[probe:instagram] ${ACTOR} input:`, JSON.stringify(input));

  const places = (await runActor(ACTOR, input)) as Record<string, any>[];
  console.log(`[probe:instagram] place search returned ${places.length} place(s)`);
  if (places.length === 0) {
    console.log('[probe:instagram] EMPTY — place search returned nothing; try a different geo path.');
    return;
  }
  const place = places[0];
  console.log(
    `[probe:instagram] resolved place: name="${place.name}" city="${place.location_city}" id=${place.location_id} media_count=${place.media_count} nestedPosts=${Array.isArray(place.posts) ? place.posts.length : 'none'}`,
  );

  // Step 2: scrape actual posts from that location page. This is the real content-first geo path —
  // posts GEOTAGGED at a Swedish location. directUrls of the location page + resultsType 'posts'.
  const locId = place.location_id ?? place.id;
  const locUrl = `https://www.instagram.com/explore/locations/${locId}/`;
  const postsInput = {
    directUrls: [locUrl],
    resultsType: 'posts',
    resultsLimit: RESULTS_LIMIT,
    addParentData: false,
  };
  console.log(`[probe:instagram] step2 ${ACTOR} input:`, JSON.stringify(postsInput));
  const raw = (await runActor(ACTOR, postsInput)) as Record<string, any>[];
  // This actor returns the LOCATION object with posts NESTED under `posts`, not flattened items.
  const items: Record<string, any>[] = raw.flatMap((o) =>
    Array.isArray(o.posts) ? o.posts : o.id ? [o] : [],
  );
  console.log(`[probe:instagram] location scrape: ${raw.length} container(s) -> ${items.length} nested post(s)`);
  if (items.length === 0) {
    console.log('[probe:instagram] location returned NO posts — geotagged content is sparse.');
    return;
  }

  console.log('[probe:instagram] post-level keys:', Object.keys(items[0]));

  const has = (it: any, path: (o: any) => unknown) => {
    try {
      const v = path(it);
      return v !== undefined && v !== null && v !== '';
    } catch {
      return false;
    }
  };
  // Probe BOTH the fields we expect to exist and the ones the advisor flagged as likely-missing
  // (shares, language), so we know exactly how thin the IG signal is.
  const fields: Record<string, (o: any) => unknown> = {
    id: (o) => o.id ?? o.shortCode,
    type: (o) => o.type, // 'Video' (reel) vs 'Image'/'Sidecar'
    productType: (o) => o.productType, // 'clips' = reel
    caption: (o) => o.caption,
    videoPlayCount: (o) => o.videoPlayCount,
    videoViewCount: (o) => o.videoViewCount,
    likesCount: (o) => o.likesCount,
    commentsCount: (o) => o.commentsCount,
    sharesCount: (o) => o.sharesCount, // expected ABSENT
    ownerUsername: (o) => o.ownerUsername,
    timestamp: (o) => o.timestamp,
    thumbnail: (o) => o.displayUrl ?? o.images?.[0],
    musicId: (o) => o.musicInfo?.audio_id,
    language: (o) => o.language, // expected ABSENT
    locationName: (o) => o.locationName,
  };
  console.log('[probe:instagram] field coverage (non-empty / total):');
  for (const [name, path] of Object.entries(fields)) {
    const n = items.filter((it) => has(it, path)).length;
    console.log(`  ${name.padEnd(16)} ${n}/${items.length}`);
  }

  console.log('[probe:instagram] sample (judge if Swedish + reel vs photo):');
  for (const it of items.slice(0, 8)) {
    console.log(
      `  @${it.ownerUsername} | type=${it.type}/${it.productType ?? '-'} | views=${it.videoPlayCount ?? it.videoViewCount ?? '-'} likes=${it.likesCount} | loc=${it.locationName ?? '-'} | "${String(it.caption ?? '').replace(/\s+/g, ' ').slice(0, 50)}"`,
    );
  }
}

main().catch((err) => {
  console.error('[probe:instagram] failed:', err);
  process.exitCode = 1;
});
