-- Trend signal: separate "popular" from "trending". velocity_score is raw magnitude (engagement
-- per day); trend_score is how far that stands out from its cohort (robust modified z-score over the
-- period's videos, folding in virality). is_breakout marks the ones that cross the outlier cutoff.
-- Component signals (velocityZ, viralityZ, shareRate, ...) ride in metrics for transparency.
alter table trends add column if not exists trend_score double precision;
alter table trends add column if not exists is_breakout boolean not null default false;

-- The UI sorts trends within a slice by how much of a trend they are.
create index if not exists trends_breakout
  on trends (country, industry, period, format, trend_score desc);
