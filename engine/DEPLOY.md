# Deploy the search worker on Render

The web app's only runtime dependency on the engine is the **on-demand search
worker** (`npm run serve:searches`): it polls the `searches` table, scrapes each
new/stale term via Apify, writes the video index, scores + embeds, and marks the
search `ready`. It's a long-running poll loop, so it deploys as a Render
**Background Worker** (no port, no health check).

The other scripts (`collect`, `discover`, `worker`, `rescore`) are operator-run
batch jobs and are intentionally not deployed here.

## Option A — Blueprint (recommended)

A [`render.yaml`](../render.yaml) lives in the repo root and already defines the
worker (`rootDir: engine`, single instance, paid `starter` plan).

1. In Render: **New +** → **Blueprint**, and connect this GitHub repo.
2. Render reads `render.yaml` and proposes the `trend-engine-search` worker.
3. Fill in the secret env vars below (they're declared `sync: false`, so Render
   prompts for the values instead of storing them in git).
4. **Apply** — Render runs `npm install` then `npm run serve:searches` and the
   worker starts polling immediately.

## Option B — Manual dashboard service

If you'd rather not use the blueprint: **New +** → **Background Worker**, connect
the repo, then set:

- **Root Directory:** `engine`
- **Build Command:** `npm install`
- **Start Command:** `npm run serve:searches`
- **Instances:** 1

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Same project the web app points at. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role (secret) key — bypasses RLS to write the index. |
| `APIFY_TOKEN` | yes | Pays for the scrapes. |
| `OPENAI_API_KEY` | no | Enables embeddings (hybrid/semantic search). Without it, scraped videos are lexical-search only. |
| `NODE_VERSION` | no | Pinned to `20` in the blueprint to match `package.json` engines. |
| `SERVE_POLL_MS` | no | Idle poll interval, default `3000`. |

Tuning knobs (`SEARCH_RESULTS_PER_BUCKET`, `INDEX_MAX_AGE_DAYS`, the `CLASSIFY_*`
group, etc.) all have safe defaults in `src/config/env.ts` — set them only to
override. `INDEX_MAX_AGE_DAYS` must match the web's `MAX_AGE_DAYS` (currently 30).

## Notes & gotchas

- **Single instance only.** The queue claim isn't atomic; running >1 worker
  double-scrapes (double Apify cost). Keep `numInstances: 1` / Instances: 1.
- **Background Workers need a paid plan** — Render's free tier doesn't offer
  them. The `starter` plan is the cheapest that does.
- `tsx` is a runtime dependency (not dev) so the production `npm install`
  includes it — that's what runs the TypeScript directly; there's no build step.
- The worker is **reactive**: it idles when nobody searches a new term, and wakes
  when the web marks a search `pending`. No cron needed for the search path.
