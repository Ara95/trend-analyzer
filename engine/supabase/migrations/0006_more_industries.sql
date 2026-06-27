-- Expand the category taxonomy from 5 to 17. The old set (beauty/fashion/food/fitness/tech) forced
-- mismatches — news landed in 'tech', sports + gym both in 'fitness', ~22% fell to 'all'. These rows
-- satisfy the trends.industry / accounts.industry FK; their description + embedding (definition
-- vectors for zero-shot) are filled by `npm run build:industry-vectors` from INDUSTRY_DEFINITIONS.
insert into industries (slug) values
  ('sports'), ('entertainment'), ('music'), ('gaming'), ('travel'), ('home'),
  ('family'), ('pets'), ('news'), ('finance'), ('automotive'), ('lifestyle')
on conflict (slug) do nothing;
