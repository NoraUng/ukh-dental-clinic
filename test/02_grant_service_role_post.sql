-- Run AFTER 0001+0002 in the test harness only, to replicate Supabase's
-- platform-level service_role grants on tables that now exist.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
