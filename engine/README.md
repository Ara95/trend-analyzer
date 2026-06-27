# Trend Engine

Backend engine that surfaces social-media trends for a country (start: Sweden / `SE`),
sliced by industry and content format over day/week/month windows, into Supabase.

## Architecture

Two source classes feed one `trends` table through a shared adapter contract
(`src/adapters/contract.ts`). **Adding a source is one new file in `src/adapters/`.**

- **Class A (`trend-feed`)** — platform provides pre-computed trends, mapped straight in.
  - *No Class A source is wired in v1.* TikTok Creative Center's industry-segmented hashtag
    trends cover only ~27 countries and **Sweden is not one of them** (verified: the same
    27-country list appears across independent Creative Center actors, so it is TikTok's limit,
    not the scraper's). Country-level SE hashtags exist without any industry breakdown, which is
    too thin to be useful — so for a small market like Sweden we derive trends ourselves (Class B).
- **Class B (`raw-content`)** — no usable native trend surface; the engine derives trends from
  engagement velocity over a curated panel of SE accounts (the `accounts` table). Sweden = the
  panel (`accounts.country = 'SE'`); industry = the account-first classifier. Windows: day, week,
  month.
  - **Instagram** via `apify/instagram-reel-scraper`.
  - **TikTok** via a profile/video scraper (`clockworks/free-tiktok-scraper`, swappable via
    `TIKTOK_ACTOR_ID`; `TIKTOK_RESULTS_PER_PAGE` caps videos pulled per profile). Pay-per-result,
    so cost ≈ per-result × `TIKTOK_RESULTS_PER_PAGE` × #panel accounts × #periods.

### Facebook / Meta (out of scope)

Facebook is **not** ingested in this build. The future Class A feed for Meta is the **Ad
Library** (`apify/facebook-ads-scraper`) — **not** the posts scraper. When added, it slots
in as one more Class A adapter file.

## Setup

```bash
cd engine
cp .env.example .env   # fill in Supabase + Apify credentials
npm install
```

### Database (Supabase)

The schema lives in `supabase/` as Supabase CLI migrations + a seed file:

- `supabase/migrations/0001_init.sql` — core schema (industries, accounts,
  content_snapshots, trends) + pgvector + the `industries` reference rows.
- `supabase/migrations/0002_classification.sql` — classification subsystem
  (account_classification cache, content_industries multi-label, industry definition
  vectors, v2 cluster scaffolding).
- `supabase/migrations/0003_grants.sql` — grants DML on the engine tables to `service_role`.
  Recent Supabase does not auto-expose new tables to the Data API roles, so the worker (which
  uses the service-role / secret key) needs this both locally **and** on the cloud project.
- `supabase/migrations/0004_discovery.sql` — `accounts.discovered` / `discovered_at` provenance
  for auto-harvested accounts (see Discovery below) vs. human-curated panel accounts.
- `supabase/seed.sql` — placeholder curated SE panel, applied on every `db reset`. Replace the
  handles with your real panel, or let Discovery auto-fill the panel instead.

**Local development** (requires Docker). The CLI is a dev dependency, so use `npx supabase`:

```bash
npx supabase start          # boots Postgres + Studio + PostgREST; applies migrations + seed
npx supabase status         # prints the local API URL + keys
npx supabase db reset       # re-applies all migrations + seed.sql from scratch
npx supabase stop           # stops the local stack
```

This project runs on a custom port block (`64321`+) so it can coexist with other local
Supabase projects on the default `54321` ports. After `start`, point `.env` at the local stack:

```
SUPABASE_URL=http://127.0.0.1:64321
SUPABASE_SERVICE_ROLE_KEY=<the "Secret" key (sb_secret_…) from `npx supabase status`>
```

The local `Secret` key (`sb_secret_…`) is the service-role-equivalent key (bypasses RLS).
Studio runs at http://127.0.0.1:64323. Analytics (logflare) is disabled in `config.toml`
because it does not run on Windows without extra Docker daemon configuration.

**Remote project.** Link once, then push the same migrations:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push        # applies supabase/migrations/* to the linked project
```

After migrating, if you use classification with an OpenAI key, build the industry
definition vectors once: `npm run build:industry-vectors`.

The `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never ship it to a browser /
the future Next.js app, which should use the anon key + RLS.

## Run

### Content-first trends (recommended) — `npm run collect`

The most direct way to get Swedish trends: **one run, no account panel, no cold start.**

```bash
npm run collect    # scrape Swedish content → score by engagement/recency → classify → store
```

1. Collects Swedish content via free-text **search** (`SE_SEARCH_QUERIES` — matches caption text, so
   it surfaces content that trends **without** being hashtagged), `COLLECT_RESULTS_PER_PAGE` videos
   per query. A hashtag pass is **off by default** (`COLLECT_INCLUDE_HASHTAGS=true` to add it — it
   mostly re-scrapes the same videos at ~2x cost).
2. Scores each video by **recency-normalized engagement** —
   `(likes·1 + comments·2 + shares·3 + views·0.05) / age_in_days` from `createTimeISO`. So a single
   scrape yields trends immediately (no ≥2-snapshot velocity needed). Keeps videos posted within the
   period window (week) **and** whose `textLanguage` is in `SE_ALLOWED_LANGUAGES` (default `sv,un` —
   a soft geo gate; add `en` to loosen), ranks, takes the top `CONTENT_TREND_LIMIT` (default 50).
3. **Classifies each trend's industry from its content before storing** so the UI can filter by
   industry. Classification uses the author's **aggregated captions across the whole scrape** (not
   just the one top-video caption) via the zero-shot + LLM tagger, and reuses the account cache when
   the author is known/discovered.
4. **Decides which videos are actually trends, not just popular** (see below), writing `trend_score`
   + `is_breakout` alongside the raw metrics.
5. Writes `video` + `audio` trends to `trends` (idempotent upsert; audio requires ≥2 videos sharing
   the sound, so single-video sounds aren't counted as trends).

### How we decide a video is a *trend* (not just popular)

High absolute engagement = **popular**. A **trend** stands out *relative to its peers*. From a single
scrape (no second snapshot) we compute, per period cohort (`content/trendsignal.ts`):

- **B — cohort outlier:** a robust **modified z-score** (median + MAD, not mean/std, because
  engagement is heavy-tailed) of each video's velocity against the rest of that period's videos.
  Answers "is this unusually fast *for right now*", separating a genuine breakout from a big account
  that always gets views. A relative MAD floor (10% of median) stops a near-uniform cohort from
  manufacturing fake breakouts.
- **D — virality:** age-independent `shares/views`, `comments/views`, `(likes+comments+shares)/views`.
  A video with a high share rate is *spreading* even if its raw view count is modest — caught here,
  invisible to a "top by views" list. Gated by `TREND_MIN_VIRALITY_VIEWS` (default 10k): below that,
  the ratios are a small-denominator artifact (a few friends, not a breakout) so only velocity counts.

`trend_score` = the stronger of the two z-scores; `is_breakout` = `trend_score >= TREND_BREAKOUT_Z`
(default 3.5, the classic outlier cutoff — lower to surface more). The cohort is the whole period
(cross-industry), so filtering the UI to a low-engagement industry may show few breakouts — the
baseline is set by the loud industries. The UI sorts/filters on these.
*Limitation:* one snapshot can't measure true acceleration — this is a lifetime-average proxy. True
velocity (incl. genuine rise-from-tiny) needs a cheap second scrape of just the top candidates
(v2; deliberately deferred for cost).

**Re-score stored trends without scraping** (`npm run rescore`): recompute B+D over the trends
already in the DB — zero Apify cost. Use after deploying the signal or to re-tune `TREND_BREAKOUT_Z`
against real data (it prints how many cross z≥2.5 / 3.0 / 3.5).

This is the model where, *regardless of account*, content trends in Sweden based on views, age, and
engagement. **Caveats:** (1) a share still lands in `industry = 'all'` (uncategorized) when captions
are too thin to classify; (2) geo is seed+language based, not guaranteed — broaden/tighten via
`SE_SEARCH_QUERIES`, `SE_DISCOVERY_HASHTAGS`, and `SE_ALLOWED_LANGUAGES`.

### Account-based worker — `npm run worker`

The panel/velocity model (tracks known accounts, measures acceleration across ≥2 snapshots). Used by
Instagram; available for TikTok over a curated/discovered panel.

```bash
npm run worker -- --source=tiktok --country=SE            # day + week + month
npm run worker -- --source=instagram --country=SE         # day + week + month
npm run worker -- --source=instagram --country=SE --period=day
```

The worker scrapes raw Class B content once per invocation and stores it in
`content_snapshots`, then derives velocity per period window from the **accumulated
snapshot history**. So Class B trends appear only after at least two runs of an account's
reels (cold start — velocity needs ≥2 snapshots of the same reel); longer windows (month)
need correspondingly more run history. Drop the worker into cron or a Supabase scheduled
function for periodic polling.

## Discovery (auto-fill the panel)

Class B needs a panel of SE accounts, but you don't have to hand-pick them. `npm run discover`
populates the panel automatically (TikTok, v1):

```bash
npm run discover    # scrape Swedish hashtags → harvest authors → classify → upsert accounts
```

1. Scrapes the Swedish hashtag seeds (`SE_DISCOVERY_HASHTAGS`, default `svensktiktok, sverige,
   svenskmat, träningsverige, svenskskönhet`; `SE_DISCOVERY_RESULTS_PER_HASHTAG` videos each).
   Geo = the hashtag anchor, so **all** surfaced authors are taken as SE candidates.
2. Harvests unique authors and skips ones already in `accounts`.
3. Classifies each new author's industry from its captions (account inference — needs
   `OPENAI_API_KEY`). Because `derive()` slices trends by `accounts.industry`, only authors we
   can confidently bucket into a real industry are persisted; the rest are dropped (and counted in
   the log), so the panel doesn't fill with country-level (`all`) noise.
4. Upserts the kept accounts with `discovered = true` (insert-only — never clobbers curated rows).

Then run the worker as usual; discovered accounts are tracked like any other panel account:

```bash
npm run discover
npm run worker -- --source=tiktok   # twice (cold start) to see trends from discovered accounts
```

Discovered accounts are stored as **guesses** (their inferred industry, not human ground truth);
re-running discovery does not re-classify existing ones in v1. Caption samples from hashtag mode
can be thin — if the log shows most candidates dropped as uncertain, that's the signal to enrich
classification (e.g. a per-author profile scrape) rather than a plumbing problem.

## Test

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## Classification (industry / category)

Trends are sliced by industry, but most content has **no reliable hashtag** and may come from
accounts we have never bucketed (including viral breakouts). So industry is attributed by an
**account-first, cost-tiered** classifier, not by hashtags. The unit of classification is the
**account**, not the video: most content inherits its category from the account that posted it;
per-video analysis is a selective fallback. `classify()` (`src/classify/classify.ts`) walks
ordered layers and stops at the first that reaches `confidenceThreshold`:

1. **Panel** (`method: panel`) — account is in the curated `accounts` table → inherit its
   industry. **Zero model calls.** Covers the majority of content.
2. **Cached** (`method: cached`) — a fresh `account_classification` row (within
   `CLASSIFY_CACHE_MAX_AGE_DAYS`). **Zero model calls.**
3. **Account inference** (`method: account_infer`) — for an unseen account, classify the
   **account once** from bio + name + recent captions: embed and zero-shot against the per-industry
   definition vectors, then an LLM tagging pass to confirm. The result is **cached**, so all later
   content from that account is a layer-2 hit. This is the answer to "viral with no hashtag":
   classify the breakout account, cache, done.
4. **Content fallback** (`method: content`) — only when the account is ambiguous (low confidence)
   or the video is off-topic, **and** the content cleared the velocity gate. Escalates in cost
   order, stopping when confident: **a.** caption (cheapest) → **b.** transcript → **c.** vision
   on keyframes (most expensive). Run selectively and asynchronously, after derive.

Output is always **multi-label with confidence** (`content_industries`), never a single hard
label — content can belong to several industries at once. `trends.industry` remains the
denormalized single slice dimension (it is part of the trends idempotency key); the multi-label
join table is a separate axis that coexists with it.

### Where it runs

- **At ingest** (`ingest()`), account-first layers 1-3 run synchronously and cheaply — each
  distinct account is classified **once** and all its content inherits the labels.
- **After derive** (`escalate()`), content-level layer 4 runs on two velocity-gated buckets,
  capped together at `CLASSIFY_ESCALATION_LIMIT` (drops are logged, never silent):
  - **low-confidence** content (ambiguous account) → full caption→transcript→vision escalation;
  - **off-topic** content — a high-velocity video from a *known* (panel/cached) account, which is
    high-confidence by construction and so can never be low-confidence eligible. This is the
    "known creator posting off-topic content" case: it gets a **caption-only spot-check**
    (`spotCheckOffTopic`) that adds a content-derived label **only** when the caption diverges from
    the account's industry with high confidence. On-topic videos add nothing.

Content already carrying a `content`-method label is skipped on later runs, so escalation does not
loop. (A residual: a high-velocity on-topic panel video is re-spot-checked each run until its
velocity drops — bounded to the cheapest tier, one caption embed, and the per-run limit.)
Escalation labels **coexist** with the account-inherited label (multi-label by design); superseded
low-confidence labels are not deleted.

### Thresholds (env, see `.env.example`)

- `CLASSIFY_CONFIDENCE_THRESHOLD` (0..1, default 0.7) — below this a layer is "not confident";
  drives escalation and uncertainty.
- `CLASSIFY_VELOCITY_THRESHOLD` (default 1000) — the escalation gate, in **raw
  weighted-engagement-per-day units** (`likes*1 + comments*2 + shares*3 + views*0.05` per day,
  signed; see `src/engine/derive.ts`). **Not a 0..1 value.** Keep it high so the expensive vision
  tier rarely fires; tune down against observed velocities.
- `CLASSIFY_CACHE_MAX_AGE_DAYS`, `CLASSIFY_ACCOUNT_RECENT_POSTS`, `CLASSIFY_ESCALATION_LIMIT`,
  `CLASSIFY_ESCALATION_WINDOW_DAYS`, `CLASSIFY_SIMILARITY_FLOOR`.

### Cost rationale

Thousands of **accounts** vs millions of **videos** — so we classify accounts and cache
aggressively (layers 1-2 cost zero model calls). Transcript and vision are reserved for
high-velocity, low-confidence items only, so precise (expensive) analysis is spent only on
content worth classifying precisely. The model providers (`Embedder` / `Tagger` / `VisionTagger`)
are injected interfaces — `OPENAI_API_KEY` is optional; without it the deterministic layers still
run. Providers are implemented over the OpenAI REST API with the built-in `fetch` (no SDK
dependency).

## v2 (not implemented)

pgvector is enabled and embedding columns exist (`content_snapshots.embedding`,
`industries.embedding`), but **semantic clustering is not built yet**: embedding captions/
transcripts and clustering so one trend merges across accounts and emergent subcategories surface,
with the cluster (not the video) carrying the industry labels. The `cluster_industries` table is
scaffolded for it. Also deferred (scope): live **unseen-account ingestion** (an Instagram profile
scraper for bio/recent posts and the keyword/video scraper that surfaces unknown accounts — today
`classify()` is built and unit-tested against injected signals), real **ffmpeg keyframe
extraction** for the vision tier (`downloadKeyframes` returns `[]` until then), and a **YouTube**
adapter (the classification tables are already platform-agnostic `text`, so YouTube is ready).
