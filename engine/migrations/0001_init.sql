-- Trend engine schema. pgvector enabled now; clustering NOT implemented (v2).
create extension if not exists vector;

-- Industry lookup. 'all' is the sentinel for country-level (non-industry) trends.
create table if not exists industries (
  slug text primary key
);
insert into industries (slug) values
  ('all'), ('beauty'), ('fashion'), ('food'), ('fitness'), ('tech')
on conflict (slug) do nothing;

-- Curated panel (Class B). Instagram-only in v1; platform kept for future panels.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  handle text not null,
  platform text not null check (platform in ('tiktok', 'instagram')),
  industry text not null references industries(slug),
  country text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform, handle)
);

-- Raw Class B measurements. embedding is reserved for v2 clustering (unused now).
create table if not exists content_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  platform text not null check (platform in ('tiktok', 'instagram')),
  external_id text not null,
  format text not null,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  audio_id text,
  captured_at timestamptz not null,
  metrics jsonb not null default '{}'::jsonb,
  embedding vector(1536)
);
create index if not exists content_snapshots_lookup
  on content_snapshots (platform, external_id, captured_at);

-- Unified trend store for both source classes.
create table if not exists trends (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_class text not null check (source_class in ('trend-feed', 'raw-content')),
  platform text not null check (platform in ('tiktok', 'instagram')),
  country text not null,
  industry text not null references industries(slug),
  format text not null,
  label text not null,
  period text not null check (period in ('day', 'week', 'month')),
  -- Class A native (nullable):
  rank int,
  rank_movement int,
  direction text check (direction in ('rising', 'falling', 'stable')),
  views bigint,
  -- Class B derived (nullable):
  velocity_score double precision,
  sample_size int,
  sample_window_days int,
  metrics jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (source, platform, country, industry, format, label, period)
);
create index if not exists trends_slice on trends (country, industry, format, period);
