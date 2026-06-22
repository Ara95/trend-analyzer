# Social Media Trend Engine — Design Spec

**Date:** 2026-06-22
**Status:** Approved design → writing implementation plan
**Scope:** Backend ingestion + engine + storage only. No frontend. A future Next.js
dashboard reads from the same Supabase database.

---

## 1. Goal

A Node.js + TypeScript backend engine that surfaces **trends for a country** (start:
Sweden / `SE`), sliced by **industry** and **content format**, over **day / week /
month** time windows. The engine writes into one unified `trends` store that a later
Next.js dashboard will read.

---

## 2. Core architecture: two source classes, one trend store

Two source classes feed one `trends` table through a single shared adapter contract.
**Adding a source is one new file in `engine/src/adapters/`.**

- **Class A — `trend-feed`:** the platform hands us pre-computed trends. We map them
  straight into `trends`. No derivation.
- **Class B — `raw-content`:** no native trend surface. We ingest raw content snapshots
  into `content_snapshots`, and the engine derives trends from engagement velocity.

### Source decisions for this build (validated by web analysis, 2026-06-22)

| Source | Class | Method | Why |
|---|---|---|---|
| **TikTok** | **A** | Creative Center via Apify (pre-computed) | Creative Center is TikTok's own authoritative trend surface (the data advertisers pay for), natively sliced by country. No panel-selection bias, no derivation. |
| **Instagram** | **B** | Curated SE account panel → reel snapshots → velocity | Instagram has no native trend surface, so trends must be derived from engagement velocity. |

**Facebook is out of scope.** README must note: the Meta Ad Library
(`apify/facebook-ads-scraper`) is the **future Class A feed for Meta — not the posts
scraper.** This keeps Class A a live, designed-for path even though TikTok and IG are the
only sources built now.

### TikTok specifics (from web analysis)

The default actor `automation-lab/tiktok-trends-scraper` (swappable via env) returns four
categories. Native industry filtering exists **only for hashtags**; everything else is
country-level. Period options are **7 / 30 / 120 days** (no native day granularity).

- **Trending sounds** → stored as **country-level** trends (`industry = 'all'`).
  Prioritized as the primary non-hashtag signal (sounds are the strongest TikTok
  virality driver).
- **Trending hashtags** → stored **per industry** (the only industry-sliceable category).
  Carries native `rank`, `rankDiff` (rank movement), `direction` (rising/falling/stable).
- **Videos / creators** → country-level (`industry = 'all'`), optional in v1.

> Exact Apify output field names are confirmed against the actor's docs at implementation
> time. This spec defines the normalization seam, not the raw field shapes.

---

## 3. Repository structure (monorepo)

```
trend-analyzer/
├─ engine/                      # THIS scope
│  ├─ src/
│  │  ├─ adapters/
│  │  │  ├─ contract.ts         # shared SourceAdapter contract + shared types
│  │  │  ├─ tiktok.ts           # Class A — Creative Center pass-through
│  │  │  └─ instagram.ts        # Class B — reel snapshots
│  │  ├─ engine/
│  │  │  └─ derive.ts           # velocity v1 (Class B only)
│  │  ├─ store/
│  │  │  ├─ supabase.ts         # service-role client (server-side only)
│  │  │  ├─ trends.ts           # idempotent upserts into `trends`
│  │  │  └─ snapshots.ts        # writes into `content_snapshots`
│  │  ├─ config/
│  │  │  ├─ env.ts              # env loading + validation
│  │  │  └─ industries.ts       # industry enum
│  │  └─ worker.ts              # CLI entrypoint (manual run, cron-ready)
│  ├─ migrations/               # SQL: pgvector + tables
│  ├─ .env.example
│  ├─ package.json              # ESM, tsx, Node 20+
│  └─ tsconfig.json
├─ web/                         # Next.js dashboard — LATER, placeholder only
└─ docs/superpowers/specs/      # this spec
```

---

## 4. Shared adapter contract (the central abstraction)

Both classes implement the same interface. A Class A source implements `fetchTrends` and
returns `[]` from `fetchSnapshots`; a Class B source does the reverse.

```ts
type SourceClass = 'trend-feed' | 'raw-content';
type Platform = 'tiktok' | 'instagram';
type Format = 'hashtag' | 'audio' | 'video' | 'creator' | 'reel';
type Period = 'day' | 'week' | 'month';

interface RunContext {
  country: string;        // ISO-2, e.g. 'SE'
  period: Period;
  // adapters map Period -> their own native window (e.g. week -> 7d for TikTok)
}

interface NormalizedTrend {
  platform: Platform;
  format: Format;
  label: string;          // hashtag text, sound title, etc.
  country: string;
  industry: string;       // 'all' for country-level (NEVER null — see §6 idempotency)
  period: Period;
  // Class A native (nullable for Class B):
  rank?: number;
  rankMovement?: number;  // TikTok rankDiff
  direction?: 'rising' | 'falling' | 'stable';
  views?: number;
  // Class B derived (nullable for Class A):
  velocityScore?: number;
  sampleSize?: number;
  sampleWindowDays?: number;
  metrics?: Record<string, unknown>;  // source-specific extras
}

interface ContentSnapshot {
  platform: Platform;
  accountId: string;
  externalId: string;     // reel/video id
  format: Format;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  audioId?: string;
  capturedAt: string;     // ISO timestamp
  metrics?: Record<string, unknown>;
}

interface SourceAdapter {
  id: string;             // 'tiktok' | 'instagram'
  platform: Platform;
  sourceClass: SourceClass;
  fetchTrends(ctx: RunContext): Promise<NormalizedTrend[]>;     // Class A; B returns []
  fetchSnapshots(ctx: RunContext): Promise<ContentSnapshot[]>;  // Class B; A returns []
}
```

### Worker flow per run

```
for each adapter matching the run:
  if sourceClass == 'trend-feed':         # Class A (TikTok)
     trends = adapter.fetchTrends(ctx)
     upsert trends                         # straight mapping, no derivation
  if sourceClass == 'raw-content':         # Class B (Instagram)
     snapshots = adapter.fetchSnapshots(ctx)
     store snapshots
     trends = derive(snapshots, ctx)       # velocity v1
     upsert trends
```

---

## 5. Engine — velocity v1 (`derive.ts`, Class B only)

- **Engagement** per snapshot = weighted sum of likes/comments/shares (and optionally
  views). Weights live in config so they are tunable.
- For each content item, **velocity** for a period = engagement growth between the latest
  snapshot and the earliest snapshot **within that period's lookback window**
  (day = 1d, week = 7d, month = 30d), normalized to a per-day rate so windows are
  comparable.
- Aggregate per `industry × format`, rank by velocity, write top-N as trends.
- **Cold start (explicit):** velocity needs ≥2 snapshots. The first poll of an account
  stores only a baseline — no trend is derivable until snapshot #2. Items with <2
  snapshots in the window are skipped. The engine computes over whatever window is
  actually available and tags `sampleWindowDays` so a "month" trend built on 3 days of
  data is visibly immature rather than silently misleading.
- **No clustering.** pgvector is enabled and an embedding column exists, but zero
  clustering logic is built (that is v2).

---

## 6. Data model (Supabase / Postgres)

**`industries`** — lookup of industry slugs (e.g. beauty, fashion, food, fitness, tech).
Plus reserved value `'all'` for country-level (non-industry) trends.

**`accounts`** — DB-driven panel (edited in the DB, not in code). IG-only in v1; `platform`
column kept for future TikTok/other panels.
- `id`, `handle`, `platform`, `industry`, `country`, `active`, `created_at`.

**`content_snapshots`** — raw Class B measurements (Instagram now).
- `id`, `account_id`, `platform`, `external_id`, `format`, `views`, `likes`, `comments`,
  `shares`, `audio_id`, `captured_at`, `metrics jsonb`,
- `embedding vector` — **pgvector column, unused in v1** (reserved for v2 clustering).

**`trends`** — unified store for both classes. Class A native fields and Class B derived
fields are all real nullable columns (both shapes are actually populated in v1).
- Common: `source`, `source_class`, `platform`, `country`, `industry`, `format`, `label`,
  `period`, `computed_at`, `metrics jsonb`.
- Class A native: `rank`, `rank_movement`, `direction`, `views`.
- Class B derived: `velocity_score`, `sample_size`, `sample_window_days`.

**Idempotency:** unique constraint on
`(source, platform, country, industry, format, label, period)`; re-runs **upsert** (latest
wins, refresh `metrics` + `computed_at`) so no duplicates.
- `industry` uses the sentinel `'all'` (never `NULL`) for country-level trends, because
  Postgres unique constraints treat `NULL`s as distinct and would allow duplicate rows.

**Migrations** enable pgvector (`create extension if not exists vector`) and add the
embedding column. No clustering.

---

## 7. Period handling across classes

| Period | TikTok (Class A / Creative Center) | Instagram (Class B / velocity) |
|---|---|---|
| `day`   | not natively available — not populated | derived (1d window) |
| `week`  | 7-day Creative Center window | derived (7d window) |
| `month` | 30-day Creative Center window | derived (30d window) |

The `period` enum is unified. Not every (source × period) cell is populated — this is
intentional and honest, not a gap to paper over. (Creative Center's 120-day window is
available as a future `quarter` period if wanted; out of scope for v1.)

---

## 8. Worker entrypoint

- A single CLI: `tsx engine/src/worker.ts`, runnable manually with flags
  (e.g. `--source=tiktok --country=SE --period=week`).
- Structured so it drops trivially into cron / a Supabase scheduled function later. **No
  scheduler is built now.**
- TikTok runs populate `week` + `month`; Instagram runs populate `day` + `week` + `month`.

---

## 9. Tech stack (pinned)

- **Node 20+**, **TypeScript**, **ESM**, **tsx** for running.
- **Supabase (Postgres)** via `@supabase/supabase-js`, **service-role key, server-side
  only**.
- **pgvector enabled now**; clustering NOT implemented (v2).
- **apify-client** for actor calls.
- Secrets via `.env`; repo ships `.env.example` with placeholders only. TikTok actor id is
  env-configurable (swappable).

---

## 10. Explicitly out of scope (v1)

- Any frontend / Next.js code (placeholder `web/` dir only).
- Vector clustering / embeddings computation.
- Facebook / Meta ingestion (documented as a future Class A feed).
- A built-in scheduler (CLI is cron-ready instead).
- TikTok day-granularity and TikTok Class B panel velocity (possible future hybrid).
