-- Automatic account discovery: provenance for accounts surfaced by the discovery loop
-- (Swedish hashtags → harvested authors) vs. human-curated panel accounts.
--
-- `discovered = false` is a curated/ground-truth account; `true` is an auto-harvested guess whose
-- industry was inferred at discovery time. Grants from 0003 are table-level, so the new columns are
-- already reachable by service_role — no extra grant needed.
alter table accounts add column if not exists discovered boolean not null default false;
alter table accounts add column if not exists discovered_at timestamptz;

create index if not exists accounts_discovered on accounts (platform, discovered);
