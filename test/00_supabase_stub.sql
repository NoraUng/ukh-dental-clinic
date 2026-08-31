-- Minimal stand-in for the parts of a real Supabase project this repo's
-- migrations assume exist (auth schema/table/function, and the three
-- Postgres roles Supabase creates by default). NOT part of the delivered
-- migrations — this file exists only so 0001/0002 can be exercised against
-- a plain local Postgres for testing.

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

-- A real Supabase project grants USAGE on the auth schema (so
-- policies/triggers can call auth.uid()) as part of platform provisioning
-- — replicate that here.
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Real Supabase projects grant service_role broad privileges on the public
-- schema as part of platform provisioning (on top of BYPASSRLS) — this
-- repo's migrations correctly don't re-grant that themselves. Replicate it
-- here so the Edge Function's service-role inserts can be tested locally.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
