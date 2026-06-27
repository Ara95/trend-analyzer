-- On-demand search (engine step 4 / "search anything"). The index is no longer pre-filled by a daily
-- blanket scrape: instead each user search is scraped ON DEMAND the first time, cached for 30 days, and
-- served from the DB thereafter. `searches` is the scrape ledger (freshness + status); the actual
-- results come from searching the `videos` index. A background worker (npm run serve:searches) drains
-- pending rows.

create table if not exists searches (
  id uuid primary key default gen_random_uuid(),
  -- normalized term (trim + lowercase + collapsed whitespace) — the dedupe / cache key.
  query text not null unique,
  status text not null default 'pending' check (status in ('pending', 'running', 'ready', 'error')),
  result_count int not null default 0,
  error text,
  -- popularity signal (how many times this term has been searched) — seeds future pre-warming.
  hits int not null default 1,
  last_scraped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The worker claims the oldest waiting term.
create index if not exists searches_pending on searches (status, created_at);

grant select, insert, update on searches to service_role;

-- A TikTok/IG search for "gaming setup" returns videos relevant to the term whose captions may not
-- contain those words. So tag each video with the query that scraped it and FOLD it into the FTS
-- vector — that guarantees scraped-for-a-term videos surface for that term, not just ones that happen
-- to mention it verbatim. Last-write-wins on re-scrape (one dominant term per video is the common case).
alter table videos add column if not exists source_query text;

-- Rebuild the generated tsvector to include source_query (dropping the column drops its GIN index).
drop index if exists videos_caption_fts;
alter table videos drop column if exists caption_tsv;
alter table videos add column caption_tsv tsvector
  generated always as (
    to_tsvector('simple', coalesce(caption, '') || ' ' || coalesce(source_query, ''))
  ) stored;
create index videos_caption_fts on videos using gin (caption_tsv);
