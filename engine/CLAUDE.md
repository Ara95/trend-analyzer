# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the `engine/` workspace (`@trend-analyzer/engine`) of the trend-analyzer monorepo. The
sibling `web/` (Next.js) reads the Supabase tables this engine writes; it has its own CLAUDE.md.
Read `README.md` here for the full product/architecture rationale — this file is the orientation
layer on top of it.

## Commands

```bash
npm test                       # vitest run (all tests)
npx vitest run src/engine.test.ts          # single test file
npx vitest run -t "name of test"           # single test by name
npm run test:watch             # vitest watch
npm run typecheck              # tsc --noEmit (no build step; tsx runs TS directly)
```

There is **no lint and no build** — `tsx` executes TypeScript directly and `npm run <script>` maps
to `tsx src/scripts/<name>.ts`. Every `scripts/*.ts` has a matching `package.json` script.

Two ways to produce trends (see README for the full story):
- `npm run collect` — **content-first** (recommended). One scrape → score → classify → store. No
  account panel, no cold start. Instagram variant: `npm run collect:instagram`.
- `npm run worker -- --source=tiktok|instagram --country=SE [--period=day|week|month]` —
  **account/velocity** model. Needs ≥2 runs per reel before trends appear (velocity is cross-snapshot).
- `npm run discover` — auto-fills the SE account panel from Swedish hashtag authors.
- `npm run rescore` — recompute the trend signal over stored trends, **zero Apify cost**.

Database (Supabase CLI, a dev dependency — always `npx supabase`):
```bash
npx supabase start             # local stack on custom port block 64321+ (Studio at :64323)
npx supabase db reset          # re-apply supabase/migrations/* + supabase/seed.sql
npx supabase db push           # apply migrations to the linked remote project
```
Note the **custom port block (64321+)**, not the default 54321, so it coexists with other local
Supabase projects. Point `.env` at `http://127.0.0.1:64321` and the `sb_secret_…` key from
`npx supabase status`.

## Architecture

**ESM + injected dependencies.** `"type": "module"` — all relative imports use the `.js` extension
even though the files are `.ts`. The codebase is built around dependency injection: `engine.ts` and
`content/pipeline.ts` take `*Deps` interfaces; `worker.ts` / the scripts are the only place the real
Supabase, Apify, and OpenAI clients are wired. Tests inject fakes (often with call counters to
assert cost-control behavior) — **do not import live clients into `src/` modules**, thread them
through the deps object.

**Two trend models share one `trends` table.** A `NormalizedTrend` (`adapters/contract.ts`) is the
common shape both write. Adapters declare a `sourceClass`:
- **Class A (`trend-feed`)** — platform-native precomputed trends. *None wired in v1* (TikTok
  Creative Center doesn't cover Sweden). `runEngine` just maps `fetchTrends()` → upsert.
- **Class B (`raw-content`)** — the engine derives trends itself. This is everything today.

**Adding a source = one file in `src/adapters/`** implementing `SourceAdapter`. Adapters only
scrape + normalize; all trend logic lives downstream.

**Two pipelines, do not confuse them:**
- `src/engine.ts` — the **account/velocity worker path**. `ingest()` scrapes once into
  `content_snapshots` + runs account-first classification (layers 1-3); `runEngine()` calls
  `engine/derive.ts` to compute velocity from *accumulated* snapshot history per period;
  `escalate()` runs selective content-level classification (layer 4) after derive.
- `src/content/pipeline.ts` (`runContentPipeline`) — the **content-first `collect` path**, shared by
  TikTok and Instagram. Rank by recency-normalized engagement → score the trend signal
  (`content/trendsignal.ts`, B+D z-scores) over the full scrape → slice top → classify each → upsert.
  Also writes the searchable video index (`store/videos.ts`, migration 0007).

**Classification (`src/classify/`) is account-first and cost-tiered.** The unit of classification is
the *account*, not the video. `classify()` walks ordered layers, stopping at the first confident one:
panel (zero model calls) → cache → account inference (embed + LLM tag, then cached) → content
escalation (caption → transcript → vision, most expensive). `OPENAI_API_KEY` is **optional** — the
deterministic panel/cache layers run without it (the `Embedder`/`Tagger`/`VisionTagger` providers
are `undefined`). Output is always **multi-label with confidence** (`content_industries`);
`trends.industry` is the single denormalized slice and part of the trends idempotency key.

**Config is centralized.** All env reading goes through `loadEnv()` (`config/env.ts`) returning a
typed `EngineConfig`; the `CLASSIFY_*` knobs are heavily documented inline there and in
`.env.example`. `CLASSIFY_VELOCITY_THRESHOLD` is **raw weighted-engagement-per-day, not 0..1**.

**Migrations: `supabase/migrations/` is canonical.** The top-level `migrations/` directory is older
and not what the CLI applies. Migration 0003 grants DML to `service_role` — the worker uses the
service-role/secret key and needs it both locally and remote.

## Layout

`src/adapters/` source scrapers (contract + tiktok + instagram) · `src/engine.ts` + `src/engine/`
worker/velocity path · `src/content/` content-first pipeline + trend signal + scoring ·
`src/classify/` the classifier layers · `src/providers/openai.ts` model impls (REST via `fetch`, no
SDK) · `src/store/` Supabase/Apify persistence boundary · `src/config/` env + industry list ·
`src/scripts/` CLI entrypoints (`collect`, `worker`, `discover`, `rescore`, and `probe-*` ad-hoc
actor probes). Tests are co-located as `*.test.ts`.
