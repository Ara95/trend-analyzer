-- Classification subsystem: account-first, cost-tiered industry classification.
-- pgvector is already enabled by 0001_init.sql. 'all' is the country-level sentinel and is
-- NOT a classification target (it carries no definition vector).

-- Industry definition vectors for zero-shot comparison (layers 3 & 4a).
alter table industries add column if not exists description text;
alter table industries add column if not exists embedding vector(1536);

-- Caption is now a queryable signal column; videoUrl/transcript ride in metrics jsonb.
alter table content_snapshots add column if not exists caption text;

-- The account classification CACHE. Keyed by (platform, account_key) where account_key is the
-- lowercased handle. platform is plain text (YouTube-ready), not constrained to the v1 platforms.
create table if not exists account_classification (
  platform text not null,
  account_key text not null,
  primary_industry text references industries(slug),
  labels jsonb not null default '[]'::jsonb, -- [{ "industry": "...", "confidence": 0..1 }]
  method text not null check (method in ('panel', 'cached', 'account_infer', 'content')),
  embedding vector(1536),
  classified_at timestamptz not null default now(),
  primary key (platform, account_key)
);

-- Per-content multi-label (many-to-many). Coexists with trends.industry, which stays the
-- denormalized slice dimension and part of the trends idempotency key.
create table if not exists content_industries (
  platform text not null,
  external_id text not null,
  industry text not null references industries(slug),
  confidence double precision not null,
  method text not null check (method in ('panel', 'cached', 'account_infer', 'content')),
  classified_at timestamptz not null default now(),
  primary key (platform, external_id, industry)
);
create index if not exists content_industries_lookup on content_industries (platform, external_id);

-- v2 scaffolding only: semantic clusters carry industry labels once clustering is built.
create table if not exists cluster_industries (
  cluster_id uuid not null,
  industry text not null references industries(slug),
  confidence double precision not null,
  primary key (cluster_id, industry)
);

-- NOTE: no ivfflat/hnsw index here. Zero-shot over ~5 industry vectors is in-process cosine.
-- A vector index belongs with v2 clustering / account-similarity, not this 5-bucket compare.
