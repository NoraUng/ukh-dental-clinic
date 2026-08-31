-- ============================================================================
-- 0002_rls_policies.sql
-- Row Level Security for every table. Two layers of defense are used
-- deliberately, not just one:
--   1. GRANT/REVOKE at the Postgres role level (anon / authenticated)
--   2. RLS policies scoped to "is this authenticated user an active staff
--      member" via the staff_profiles table
-- Even if a policy were ever misconfigured, the REVOKEs below still block
-- anonymous access outright.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- SECURITY DEFINER + a locked-down search_path so these can read
-- staff_profiles regardless of the caller's own row-level access to it,
-- without being hijackable via a spoofed search_path.
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles
    where user_id = auth.uid() and is_active = true and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- ENABLE RLS — required on every table per project security requirements,
-- including ones with no policies at all (a table with RLS enabled and zero
-- policies denies every row to every non-bypassing role by default).
-- ----------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.appointment_audit_log enable row level security;
alter table public.rate_limit_events enable row level security;

-- Belt-and-suspenders: also force RLS for the table owner, so a future
-- migration run under an owner-privileged role can't accidentally read
-- past RLS without an explicit BYPASSRLS role (service_role has that by
-- design; this just prevents silent scope creep elsewhere).
alter table public.appointments force row level security;
alter table public.staff_profiles force row level security;
alter table public.appointment_audit_log force row level security;
alter table public.rate_limit_events force row level security;

-- ----------------------------------------------------------------------------
-- GRANT / REVOKE — role-level layer, independent of RLS.
-- `anon` gets nothing on any of these tables. `authenticated` gets only
-- what staff actually need; even that is still gated by RLS below.
-- The service_role (used only by Edge Functions, server-side) bypasses RLS
-- entirely by Supabase design and needs no explicit grants here.
-- ----------------------------------------------------------------------------
revoke all on public.appointments from anon, authenticated;
revoke all on public.staff_profiles from anon, authenticated;
revoke all on public.appointment_audit_log from anon, authenticated;
revoke all on public.rate_limit_events from anon, authenticated;

grant select, update (status) on public.appointments to authenticated;
grant select on public.staff_profiles to authenticated;
grant select on public.appointment_audit_log to authenticated;
-- No grants at all for rate_limit_events: it is written and read only by
-- the Edge Function via the service-role key.

-- ----------------------------------------------------------------------------
-- POLICIES: appointments
-- anon: no policy at all -> zero access (inserts happen only through the
-- Edge Function's service-role client, which bypasses RLS).
-- authenticated: staff may SELECT all appointments and UPDATE them, but a
-- trigger below still restricts which columns an UPDATE may actually
-- change to `status` (see enforce_appointment_update_fields).
-- ----------------------------------------------------------------------------
create policy "staff can view appointments"
  on public.appointments
  for select
  to authenticated
  using (public.is_staff());

create policy "staff can update appointment status"
  on public.appointments
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No INSERT or DELETE policy for any client role: appointments are created
-- only by the Edge Function (service role) and are never hard-deleted, to
-- preserve the audit trail. If a record must be removed (e.g. a formal
-- deletion request), that is a deliberate, logged admin action performed
-- directly against the database, not an app-level operation.

-- Even though the GRANT above only allows updating the `status` column,
-- enforce the same restriction at the row level too, so a future GRANT
-- change can't silently widen what staff can edit.
create or replace function public.enforce_appointment_update_fields()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    -- Non-admin staff: only `status` (and the auto-managed `updated_at`,
    -- `last_updated_by`) may change.
    if new.reference_number is distinct from old.reference_number
      or new.full_name is distinct from old.full_name
      or new.phone is distinct from old.phone
      or new.email is distinct from old.email
      or new.patient_type is distinct from old.patient_type
      or new.service is distinct from old.service
      or new.preferred_doctor is distinct from old.preferred_doctor
      or new.preferred_date is distinct from old.preferred_date
      or new.preferred_time is distinct from old.preferred_time
      or new.message is distinct from old.message
      or new.consent is distinct from old.consent
      or new.locale is distinct from old.locale
      or new.submission_hash is distinct from old.submission_hash
      or new.ip_hash is distinct from old.ip_hash
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Only appointment status may be updated by staff.';
    end if;
  end if;

  new.last_updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_appointments_restrict_update on public.appointments;
create trigger trg_appointments_restrict_update
  before update on public.appointments
  for each row
  execute function public.enforce_appointment_update_fields();

-- ----------------------------------------------------------------------------
-- POLICIES: staff_profiles
-- Staff can see their own profile, and their colleagues' names/roles so the
-- dashboard can show "last updated by". No self-service insert/update/
-- delete — staff accounts are provisioned by an admin directly in the
-- database or Supabase Auth dashboard.
-- ----------------------------------------------------------------------------
create policy "staff can view staff directory"
  on public.staff_profiles
  for select
  to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- POLICIES: appointment_audit_log
-- Read-only for staff. Writes happen exclusively through the
-- log_appointment_change() SECURITY DEFINER trigger from 0001, which runs
-- as the table owner and is therefore unaffected by the REVOKE above.
-- ----------------------------------------------------------------------------
create policy "staff can view audit log"
  on public.appointment_audit_log
  for select
  to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- POLICIES: rate_limit_events
-- Intentionally NONE. RLS is enabled with zero policies, so every role
-- other than service_role (which bypasses RLS) is denied outright. Only
-- the Edge Function ever touches this table.
-- ----------------------------------------------------------------------------
