-- Persistent video index (step 1 of the inspiration-tool pivot). Until now the content-first flow
-- wrote only AGGREGATED rows to `trends`; there was no canonical per-video entity to search, rank by
-- creator-relative outlier, or attach AI hook/structure analysis to. This adds that index.
--
-- Account-agnostic by design: `content_snapshots` is account-tied (account_id NOT NULL) and unsuitable
-- as a global corpus, so `videos` is a new table, not an extension of it. Linkage to `creators` is by
-- (platform, handle) — no creator_id FK round-trip; snapshots key on (platform, platform_video_id) for
-- the same reason. The HNSW vector index and pg_trgm fuzzy index land in step 2 (search), where they
-- are actually read; the embedding column is created now but populated then.
--
-- pgvector: enabled by 0001_init.sql, but re-enabled here so this migration is self-sufficient if
-- applied against a DB where 0001 never ran (idempotent — `if not exists`). Platform is plain `text`
-- here (YouTube-ready), like the classification tables — NOT the closed ('tiktok','instagram') check,
-- because the pivot goes global.
create extension if not exists vector;

-- Creator panel for the index. Keyed by (platform, handle); joined to `videos` on the same pair.
-- baseline_views_median / baseline_updated_at are written by step 2 (creator-relative outlier) — left
-- null here, and deliberately NOT part of the upsert payload so re-ingest never clobbers them.
create table if not exists creators (
  platform text not null,
  handle text not null,
  display_name text,
  avatar_url text,
  follower_count bigint,
  baseline_views_median bigint,
  baseline_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  primary key (platform, handle)
);

-- Canonical per-video row. `views/likes/comments/shares` are the LATEST scraped metrics (denormalized
-- for fast sort/filter); the time series lives in `video_snapshots`. trend_score/outlier_ratio/
-- is_breakout/embedding are written by step 2 — created now, populated then.
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  platform_video_id text not null,
  creator_handle text,
  caption text,
  hashtags text[],
  audio_id text,
  url text,
  thumbnail_url text,
  posted_at timestamptz,
  language text,
  duration_seconds int,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  bookmarks bigint,
  engagement_rate double precision,
  trend_score double precision,
  outlier_ratio double precision,
  is_breakout boolean not null default false,
  -- 'simple' (no stemming): the corpus is multilingual, so language-specific stemming would help one
  -- language and hurt the rest. Generated + stored so the GIN index stays in sync automatically.
  caption_tsv tsvector generated always as (to_tsvector('simple', coalesce(caption, ''))) stored,
  embedding vector(1536),
  first_seen_at timestamptz not null default now(),
  last_scraped_at timestamptz not null default now(),
  unique (platform, platform_video_id)
);

-- Engagement time series. Velocity (step 2) reads >=2 snapshots of the same video. Keyed by the same
-- (platform, platform_video_id) pair as `videos` so ingest needs no id round-trip.
create table if not exists video_snapshots (
  platform text not null,
  platform_video_id text not null,
  captured_at timestamptz not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  primary key (platform, platform_video_id, captured_at)
);

-- Full-text search over captions (lexical half of step 2's hybrid retrieval).
create index if not exists videos_caption_fts on videos using gin (caption_tsv);
-- Group a creator's videos (creator-relative baseline, step 2).
create index if not exists videos_creator on videos (platform, creator_handle);
-- Primary slice/sort: recent, high-trend-score videos per platform.
create index if not exists videos_slice on videos (platform, posted_at desc, trend_score desc);
