-- True view velocity from the engagement time series (video_snapshots). The single-snapshot scoring
-- pass (0007/scoreVideos) derives a velocity PROXY (weighted engagement / age); this adds the REAL
-- measure: the change in views between a video's two most recent snapshots, normalized per day, plus the
-- percentage growth between them. Null until a video has >= 2 snapshots — one is written per scrape, so a
-- video accumulates a second snapshot when its search term is re-scraped on the web's freshness cadence
-- (lower that cadence to densify the series, at higher Apify cost).
alter table videos add column if not exists views_per_day double precision;
alter table videos add column if not exists views_growth_pct double precision;
alter table videos add column if not exists velocity_updated_at timestamptz;

-- Fetch a video's recent snapshots newest-first for the velocity pass. The PK is
-- (platform, platform_video_id, captured_at); this descending index serves the per-video "latest two"
-- and the windowed scan the pass runs.
create index if not exists video_snapshots_recent
  on video_snapshots (platform, platform_video_id, captured_at desc);
