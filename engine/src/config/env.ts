// Thresholds and knobs for the classification subsystem (layers 3-4 + escalation).
export interface ClassificationConfig {
  // Below this a layer is "not confident": controls escalation and "uncertain" marking. 0..1.
  confidenceThreshold: number;
  // Escalation velocity gate. RAW weighted-engagement-per-day units, SIGNED (see derive.ts:
  // likes*1 + comments*2 + shares*3 + views*0.05, per day). NOT a 0..1 value.
  velocityThreshold: number;
  // An account_classification cache hit older than this is treated as stale.
  cacheMaxAgeDays: number;
  // How many recent post captions to feed account inference (layer 3).
  accountRecentPostsCount: number;
  // Max items escalated to content-level analysis per run (the rest are logged as dropped).
  escalationLimit: number;
  // Lookback window (days) for selecting escalation candidates.
  escalationWindowDays: number;
  // Minimum per-label confidence to include a label in zero-shot output.
  similarityFloor: number;
}

export interface EngineConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apifyToken: string;
  tiktokActorId: string;
  // Videos to scrape per TikTok profile per run (caps pay-per-result cost).
  tiktokResultsPerPage: number;
  instagramActorId: string;
  // Content-first Instagram (npm run collect:instagram). Unlike TikTok, IG has no geo proxy or
  // language field, so we use a KEYWORD CAPTION search actor and detect Swedish from the caption
  // ourselves. Use Swedish-DISTINCT query words (åäö / no foreign cognate) — false friends like
  // "recept" return mostly non-Swedish and get discarded by the language gate (wasted cost).
  igSearchActorId: string;
  igSearchQueries: string[];
  // maxPages per query for the IG search actor. Volume comes from MORE QUERIES (breadth), not pages.
  igMaxPages: number;
  // Classification providers. OPENAI_API_KEY is OPTIONAL: when absent, layers 3-4 are
  // skipped and the deterministic layers 1-2 (panel + cache) still run.
  openaiApiKey?: string;
  openaiEmbedModel: string;
  openaiTagModel: string;
  openaiVisionModel: string;
  classification: ClassificationConfig;
  // Discovery: Swedish hashtag seeds whose authors become candidate accounts, and how many
  // videos to pull per hashtag. Geo is the hashtag anchor (these are Swedish tags).
  discoveryHashtags: string[];
  discoveryResultsPerHashtag: number;
  // Content-first collection: Swedish free-text search queries (catch UN-hashtagged content via
  // caption text) and the max number of top-ranked trends to classify + persist per run.
  seSearchQueries: string[];
  // Videos scraped per search query (and per hashtag, if the hashtag pass is on) in `collect`.
  // Separate from discovery's knob so tuning collect's cost doesn't change `npm run discover`.
  collectResultsPerPage: number;
  // On-demand search (collectForQuery) scrapes three age tiers per term — PAST_24_HOURS / PAST_WEEK /
  // PAST_MONTH — this many results EACH (default 15 → up to 45 distinct after dedup). Tiers are
  // cumulative at the source, so the union is fresh-weighted. Separate from collectResultsPerPage so the
  // daily collect's cost is unaffected.
  searchResultsPerBucket: number;
  // Whether `collect` also runs a hashtag pass. Off by default: the search pass already catches
  // un-hashtagged content, and hashtags mostly re-scrape the same Swedish videos at ~2x the cost.
  collectIncludeHashtags: boolean;
  contentTrendLimit: number;
  // Hard freshness ceiling for the video index: videos older than this (days) are neither ingested nor
  // kept (the worker prunes past it). Matches the web read-cap so "no trends older than 30 days" holds
  // end to end. The on-demand scrape also asks TikTok for PAST_MONTH so the cap rarely bites.
  indexMaxAgeDays: number;
  // Geo gate for content-first: keep only these textLanguage values. 'un' = undetermined (kept so
  // Swedish creators posting wordless/emoji captions aren't dropped). Add 'en' to loosen.
  seAllowedLanguages: string[];
  // Trend cutoff: a video is flagged is_breakout when its robust z-score within its period cohort
  // crosses this. 3.5 is the classic outlier cutoff; lower to surface more, raise to be stricter.
  trendBreakoutZ: number;
  // Minimum views for the virality axis to count toward a breakout — below this, engagement ratios
  // are a small-denominator artifact, not a real trend.
  trendMinViralityViews: number;
}

const DEFAULT_DISCOVERY_HASHTAGS = [
  'svensktiktok',
  'sverige',
  'svenskmat',
  'träningsverige',
  'svenskskönhet',
];

// Plain Swedish words (NOT hashtags) — search matches caption text, so this surfaces content that
// is trending in Sweden without being hashtagged. proxyCountryCode=SE geo-protects the scrape, so
// these can be plain Swedish (no distinctness needed). Broad, cross-industry — one query per
// industry so empty categories (tech/family/pets/news/finance/automotive/music) get coverage;
// classification slices the result. Volume/coverage comes from breadth (more queries), since the
// actor caps reliable depth at ~one page (see COLLECT_RESULTS_PER_PAGE).
const DEFAULT_SE_SEARCH_QUERIES = [
  'recept', 'träning', 'sminkning', 'mode', 'sverige', 'humor', 'fotboll', 'gaming',
  'resor', 'inredning', 'teknik', 'familj', 'husdjur', 'nyheter', 'ekonomi', 'bil', 'musik',
];

// IG keyword search has NO geo enforcement (ranks globally) — so unlike TikTok these MUST be
// Swedish-distinct (åäö or no foreign cognate) or the caption language gate discards most results.
// Probe yields: träning 92%, inredning 83%, recept 8% (false friend — excluded). Each word is a
// separate door; breadth (one per industry) is the main volume lever. All Swedish-distinct vs
// Danish/Norwegian (e.g. kläder≠klær, skönhet≠skønhed, fotboll≠fodbold, matlagning≠madlavning).
const DEFAULT_IG_SEARCH_QUERIES = [
  'träning', 'inredning', 'sminkning', 'hälsa', 'bakning', 'vardag', 'trädgård', 'resa',
  'kläder', 'fotboll', 'föräldraledig', 'husdjur', 'skönhet', 'matlagning',
];

function listEnv(
  source: Record<string, string | undefined>,
  key: string,
  fallback: string[],
): string[] {
  const raw = source[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function boolEnv(
  source: Record<string, string | undefined>,
  key: string,
  fallback: boolean,
): boolean {
  const raw = source[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APIFY_TOKEN'] as const;

function numEnv(
  source: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = source[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env ${key} must be a number, got "${raw}"`);
  return n;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): EngineConfig {
  const missing = REQUIRED.filter((k) => !source[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return {
    supabaseUrl: source.SUPABASE_URL!,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY!,
    apifyToken: source.APIFY_TOKEN!,
    tiktokActorId: source.TIKTOK_ACTOR_ID ?? 'clockworks/free-tiktok-scraper',
    tiktokResultsPerPage: numEnv(source, 'TIKTOK_RESULTS_PER_PAGE', 10),
    instagramActorId: source.INSTAGRAM_ACTOR_ID ?? 'apify/instagram-reel-scraper',
    igSearchActorId: source.IG_SEARCH_ACTOR_ID ?? 'patient_discovery/instagram-search-reels',
    igSearchQueries: listEnv(source, 'IG_SEARCH_QUERIES', DEFAULT_IG_SEARCH_QUERIES),
    igMaxPages: numEnv(source, 'IG_MAX_PAGES', 1),
    openaiApiKey: source.OPENAI_API_KEY,
    openaiEmbedModel: source.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small',
    openaiTagModel: source.OPENAI_TAG_MODEL ?? 'gpt-4o-mini',
    openaiVisionModel: source.OPENAI_VISION_MODEL ?? 'gpt-4o-mini',
    classification: {
      confidenceThreshold: numEnv(source, 'CLASSIFY_CONFIDENCE_THRESHOLD', 0.7),
      // Conservative (high) default so expensive vision rarely fires; tune against real velocities.
      velocityThreshold: numEnv(source, 'CLASSIFY_VELOCITY_THRESHOLD', 1000),
      cacheMaxAgeDays: numEnv(source, 'CLASSIFY_CACHE_MAX_AGE_DAYS', 30),
      accountRecentPostsCount: numEnv(source, 'CLASSIFY_ACCOUNT_RECENT_POSTS', 12),
      escalationLimit: numEnv(source, 'CLASSIFY_ESCALATION_LIMIT', 50),
      escalationWindowDays: numEnv(source, 'CLASSIFY_ESCALATION_WINDOW_DAYS', 7),
      similarityFloor: numEnv(source, 'CLASSIFY_SIMILARITY_FLOOR', 0.15),
    },
    discoveryHashtags: listEnv(source, 'SE_DISCOVERY_HASHTAGS', DEFAULT_DISCOVERY_HASHTAGS),
    discoveryResultsPerHashtag: numEnv(source, 'SE_DISCOVERY_RESULTS_PER_HASHTAG', 30),
    seSearchQueries: listEnv(source, 'SE_SEARCH_QUERIES', DEFAULT_SE_SEARCH_QUERIES),
    collectResultsPerPage: numEnv(source, 'COLLECT_RESULTS_PER_PAGE', 20),
    searchResultsPerBucket: numEnv(source, 'SEARCH_RESULTS_PER_BUCKET', 15),
    collectIncludeHashtags: boolEnv(source, 'COLLECT_INCLUDE_HASHTAGS', false),
    contentTrendLimit: numEnv(source, 'CONTENT_TREND_LIMIT', 150),
    indexMaxAgeDays: numEnv(source, 'INDEX_MAX_AGE_DAYS', 30),
    seAllowedLanguages: listEnv(source, 'SE_ALLOWED_LANGUAGES', ['sv', 'un']),
    trendBreakoutZ: numEnv(source, 'TREND_BREAKOUT_Z', 3.5),
    trendMinViralityViews: numEnv(source, 'TREND_MIN_VIRALITY_VIEWS', 10_000),
  };
}
