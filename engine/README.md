# Trend Engine

Backend engine that surfaces social-media trends for a country (start: Sweden / `SE`),
sliced by industry and content format over day/week/month windows, into Supabase.

## Architecture

Two source classes feed one `trends` table through a shared adapter contract
(`src/adapters/contract.ts`). **Adding a source is one new file in `src/adapters/`.**

- **Class A (`trend-feed`)** — platform provides pre-computed trends, mapped straight in.
  - **TikTok** via Apify Creative Center (`automation-lab/tiktok-trends-scraper`,
    swappable via `TIKTOK_ACTOR_ID`). Trending **sounds** are stored country-level
    (`industry = 'all'`); **hashtags** are stored per industry (the only category TikTok
    exposes an industry filter for). Windows: week (7d), month (30d). No native day.
- **Class B (`raw-content`)** — no native trend surface; the engine derives trends from
  engagement velocity.
  - **Instagram** via `apify/instagram-reel-scraper` over a curated panel of SE accounts
    (the `accounts` table). Windows: day, week, month.

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

Apply migrations (`migrations/0001_init.sql`, then `0002_seed_accounts.sql`) to your
Supabase project, then edit the `accounts` table to set your real curated panel.

The `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never ship it to a browser /
the future Next.js app, which should use the anon key + RLS.

## Run

```bash
npm run worker -- --source=tiktok --country=SE            # week + month
npm run worker -- --source=instagram --country=SE         # day + week + month
npm run worker -- --source=instagram --country=SE --period=day
```

The worker scrapes raw Class B content once per invocation and stores it in
`content_snapshots`, then derives velocity per period window from the **accumulated
snapshot history**. So Class B trends appear only after at least two runs of an account's
reels (cold start — velocity needs ≥2 snapshots of the same reel); longer windows (month)
need correspondingly more run history. Drop the worker into cron or a Supabase scheduled
function for periodic polling.

## Test

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
```

## v2 (not implemented)

pgvector is enabled and `content_snapshots.embedding` exists, but no clustering logic is
built yet.
