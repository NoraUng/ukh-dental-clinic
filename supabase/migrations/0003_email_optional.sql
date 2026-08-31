-- ----------------------------------------------------------------------------
-- MIGRATION: make appointments.email optional
-- ----------------------------------------------------------------------------
-- Patients can now leave the email field blank on the booking form. The
-- column was originally `not null check (char_length(email) between 5 and
-- 254)` (see 0001_init_schema.sql) — this relaxes it to allow null while
-- still enforcing the same length bounds on any email that IS provided.
-- Existing rows are unaffected (all have a non-null email already).
-- ----------------------------------------------------------------------------

alter table public.appointments
  alter column email drop not null;

alter table public.appointments
  drop constraint if exists appointments_email_check;

alter table public.appointments
  add constraint appointments_email_check
  check (email is null or char_length(email) between 5 and 254);
