-- Local seed data, applied automatically after migrations on `supabase db reset`.
-- Placeholder curated SE Instagram panel. Replace these handles with real accounts
-- (or edit the `accounts` table directly) before running the worker against live data.
insert into accounts (handle, platform, industry, country) values
  ('example_beauty_se', 'instagram', 'beauty', 'SE'),
  ('example_fashion_se', 'instagram', 'fashion', 'SE'),
  ('example_food_se', 'instagram', 'food', 'SE'),
  -- TikTok is also Class B (panel-driven). Replace with real SE TikTok handles.
  ('example_food_se_tiktok', 'tiktok', 'food', 'SE'),
  ('example_tech_se_tiktok', 'tiktok', 'tech', 'SE')
on conflict (platform, handle) do nothing;
