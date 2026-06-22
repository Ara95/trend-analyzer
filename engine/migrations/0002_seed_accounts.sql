-- Placeholder curated SE Instagram panel. Replace handles with real accounts.
insert into accounts (handle, platform, industry, country) values
  ('example_beauty_se', 'instagram', 'beauty', 'SE'),
  ('example_fashion_se', 'instagram', 'fashion', 'SE'),
  ('example_food_se', 'instagram', 'food', 'SE')
on conflict (platform, handle) do nothing;
