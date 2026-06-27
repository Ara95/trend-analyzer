-- Data API privileges for the server-side worker.
--
-- Recent Supabase API-key behaviour does NOT auto-expose newly created tables to the Data API
-- roles (anon / authenticated / service_role). The worker connects with the service-role / secret
-- key (bypasses RLS) via PostgREST, so without explicit grants every query fails with 42501
-- "permission denied". Grant full DML on the engine tables to service_role. This is required on
-- the cloud project too, not just locally.
--
-- The future Next.js app is expected to use the anon key + RLS instead, so anon/authenticated are
-- intentionally NOT granted here.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Tables created later by the migration runner (postgres) inherit the same grant automatically.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
