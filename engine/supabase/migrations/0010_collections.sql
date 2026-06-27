-- Saved inspirations — named collections per authenticated user.
--
-- This is the FIRST per-user feature in the schema, so it is also the first to use Supabase auth
-- (auth.users) + RLS instead of the service-role-bypasses-everything model the engine tables use.
-- The web app reaches these tables with the user's session (anon key + JWT via @supabase/ssr), so
-- RLS is what scopes a user to their own rows — there is no service-role access path here.
--
-- DENORMALIZED ON PURPOSE: collection_items copies the video's display fields at save time instead of
-- FK-referencing videos(id). The video index is pruned after 30 days (INDEX_MAX_AGE_DAYS), so an FK
-- would delete a user's saved item the moment its source video is pruned. Copying makes saves durable.
-- It also keeps the read path self-contained: videos has no `authenticated` grant and no RLS, so an
-- authenticated client cannot JOIN it anyway. /favoriter reads ONLY these two RLS-scoped tables.

create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
-- One collection name per user (case-insensitive) — keeps "Hooks" and "hooks" from colliding.
create unique index if not exists collections_user_name on collections (user_id, lower(name));
create index if not exists collections_user on collections (user_id, created_at desc);

create table if not exists collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections (id) on delete cascade,
  -- Denormalized owner so RLS is a single predicate per table (no join to collections needed).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Identity of the saved video (matches the videos index keying), used for de-dupe + saved-state lookup.
  platform text not null,
  platform_video_id text not null,
  -- Denormalized display snapshot (see header) — what the card needs to render without touching videos.
  caption text,
  thumbnail_url text,
  url text,
  creator_handle text,
  views bigint not null default 0,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  engagement_rate double precision,
  trend_score double precision,
  is_breakout boolean not null default false,
  posted_at timestamptz,
  saved_at timestamptz not null default now(),
  -- Same video can live in different collections, but only once per collection.
  unique (collection_id, platform, platform_video_id)
);
create index if not exists collection_items_collection on collection_items (collection_id, saved_at desc);
-- Drives the "is this video already saved?" lookup the search grid does for the logged-in user.
create index if not exists collection_items_user_video on collection_items (user_id, platform, platform_video_id);

-- RLS: a user sees and mutates only their own rows. with check on insert/update prevents writing rows
-- attributed to someone else. service_role is not granted here at all — there is no admin read path.
alter table collections enable row level security;
alter table collection_items enable row level security;

create policy collections_owner on collections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy collection_items_owner on collection_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The new Data-API behaviour does not auto-expose tables (see 0003_grants.sql). Grant the authenticated
-- role DML; RLS above narrows it to the user's own rows. anon/service_role intentionally get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on collections to authenticated;
grant select, insert, update, delete on collection_items to authenticated;
