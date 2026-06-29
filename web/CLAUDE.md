# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

This is the `web/` workspace of the trend-analyzer monorepo — a Next.js 16 app that reads the
Supabase tables the sibling `engine/` writes (the engine has its own `CLAUDE.md`). The UI is in
Swedish; only user-facing copy is translated, data values and code stay in English.

> **Next.js 16 + React 19.** This is not the Next.js in your training data (see `@AGENTS.md`).
> `cacheComponents: true` is on, the middleware convention was renamed to **`proxy.ts`**, and
> `cookies()` is async. Read the relevant guide in `node_modules/next/dist/docs/` before changing
> rendering, caching, or routing behavior.

## Commands

```bash
npm run dev      # next dev — http://localhost:3000
npm run build    # next build (the only real typecheck gate; there is no separate tsc script)
npm run lint     # eslint (flat config, next/core-web-vitals + next/typescript)
```

There is **no test suite** in this workspace (tests live in `engine/`). With no Supabase env
configured, every data read degrades to an empty/“collecting” state instead of erroring, so the app
runs and renders without a backend.

## Two Supabase clients — the central distinction

Almost every data question reduces to *which* client a path uses. They are not interchangeable:

- **Service-role client** — `createClient` from `@supabase/supabase-js`, built ad-hoc inside each
  `lib/*.ts` reader (`videos.ts`, `searches.ts`, `creators.ts`). Reads **public content** (the
  shared video index), bypasses RLS, **Server Components / server-only**. Reads
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. These never reach the browser.
- **SSR cookie-bound client** — `createClient` from `lib/supabase/server.ts` (wraps
  `@supabase/ssr`, bound to request cookies, anon key + the user's JWT). Used for everything
  **per-user**: auth checks and saved collections, scoped by `auth.uid()` via RLS. Reads
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Always resolve the user with
  `supabase.auth.getUser()` (revalidates against the auth server), **never** `getSession()`.

Mutations are Server Actions in `app/actions/` (SSR client, write `user_id` explicitly so RLS
`with check` passes). Page reads live in `lib/*.ts`.

## Architecture

**Search is the product.** `/` redirects to `/search` (the old trend dashboard was removed —
`lib/trends.ts` and `lib/query.ts` referenced in the README/comments no longer exist; treat the
README's "Hur data tolkas" section as historical). Routes: `/search`, `/favoriter`,
`/creator/[platform]/[handle]`, plus `/login` `/register` `/auth`. The authenticated surfaces live
under the `(app)` route group, whose layout enforces login and renders the shared header.

**Search read path (`lib/videos.ts`).** Reads the persistent `videos` index (engine migration 0007),
not aggregated trends. Three strategies, chosen by query + sort, each degrading to the next:
- *hybrid* — embed the query (`lib/embed.ts`, OpenAI) and call the `search_videos` RRF RPC
  (FTS + vector). Used only for the relevance sort with a query present.
- *lexical* — websearch FTS over `caption_tsv`. The fallback when there's no embedding/RPC, **and**
  the path for any explicit metric sort.
- *browse* — no query: plain filter + sort over the index.
Everything is hard-capped at `MAX_AGE_DAYS = 30` (mirrors the engine's index cap) regardless of the
period filter. OpenAI is optional — a missing key just forces the lexical path.

**On-demand scraping (`lib/searches.ts`).** A search registers the term in the `searches` table; if
it's new or its cache is stale (`TTL_DAYS = 7`, kept well under the 30-day read cap so served results
don't decay to empty), it's marked `pending` and the engine worker scrapes it. The page shows a
"collecting" state and the existing cached results meanwhile (stale-while-revalidate).

**Caching (Next 16 `cacheComponents`).** Cacheable reads use `"use cache"` + `cacheLife(...)`
(`searchVideos`, `embedQuery`, `creators`). Per-request/uncached work (auth, `ensureSearch`,
`getSavedKeys`) is gated behind `await connection()` instead of `force-dynamic` (which is
incompatible with `cacheComponents`).

**Auth gating (`proxy.ts` → `lib/supabase/middleware.ts`).** Runs on every page request: refreshes
session cookies and redirects signed-out users to `/login` (and signed-in users away from
`/login`/`/register`). The cookie-mutation dance (writing both request and response) is the required
`@supabase/ssr` pattern — don't insert logic between `createServerClient` and `getUser()`. The
`matcher` excludes `/api/*` so the image proxies stay public.

**Collections are denormalized.** Saved videos copy their display fields at save time
(`lib/collections.ts`, `app/actions/collections.ts`), so the favorites page never touches the
`videos` index and survives its 30-day prune.

**Trend brief (`lib/trend-brief.ts`).** Derives an "intelligence report" purely from the returned
result set — no extra data source. It deliberately degrades to qualitative signals or omits a tile
rather than fabricate a figure (e.g. the bias-robust within-age-band lifecycle momentum). Follow that
honesty contract when extending it: `null` means "hide the tile".

**Image proxies.** `/api/thumbnail` (TikTok oEmbed redirect) and `/api/ig-thumbnail` (fetches
Instagram CDN bytes server-side to defeat hotlink/referrer checks, with an SSRF host allowlist, and
returns a transparent pixel on any failure). The engine doesn't store real covers, so the cards
otherwise rely on these.

## Conventions

- **Path alias `@/*`** maps to the workspace root (`tsconfig.json`).
- **UI**: shadcn/ui (`radix-nova` style, components in `components/ui/`) on **Tailwind v4** (config is
  CSS-first in `app/globals.css`, no `tailwind.config`), `lucide-react` icons.
- **Filters are URL-driven**, not client state — parsed/serialized in `lib/search-query.ts`; defaults
  are omitted from hrefs to keep shared links clean. Enum→Swedish-label maps live in `lib/constants.ts`.
- `handoff/` and `design_handoff_premium_lyft/` are static design mockups (reference only), not app
  code. Note that only `handoff/**` is eslint-ignored — files under `design_handoff_premium_lyft/`
  (e.g. its `support.js`) *will* be linted.

## Environment

No `.env.example` ships in this workspace. The app needs (in `.env.local`):

```
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY            # service-role: public content reads (server-only)
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   # SSR auth + per-user collections
OPENAI_API_KEY (+ optional OPENAI_EMBED_MODEL)      # optional — enables hybrid/semantic search
```

Point Supabase at the engine's local stack (`http://127.0.0.1:64321`, the engine uses a custom port
block) or a cloud project.
