-- ============================================================================
-- 0005_contact_messages.sql
-- Backs the public "Send a Message" contact form (previously a pure
-- front-end demo — see script.js's old handleContactSubmit, which validated
-- locally and then discarded the input without sending it anywhere). This
-- table + submit-contact Edge Function + staff dashboard section make it a
-- real, working form, following the exact same security pattern as
-- appointments: RLS + REVOKE, no direct anon table access, inserts only via
-- the service-role Edge Function.
-- ============================================================================

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (char_length(full_name) between 2 and 100),
  email        text not null check (char_length(email) between 5 and 254),
  message      text not null check (char_length(message) between 5 and 1000),

  is_read      boolean not null default false,

  -- SHA-256 hex hash of the submitting IP (salted server-side), same
  -- purpose as appointments.ip_hash — supports rate limiting only, never a
  -- direct identifier and never displayed in the UI.
  ip_hash      text,

  created_at   timestamptz not null default now()
);

comment on table public.contact_messages is
  'General "Send a Message" contact form submissions — separate from appointment requests.';

create index if not exists idx_contact_messages_created_at on public.contact_messages (created_at desc);
create index if not exists idx_contact_messages_ip_hash_created on public.contact_messages (ip_hash, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS — same two-layer pattern as every other table (see 0002_rls_policies.sql):
-- REVOKE at the role level, plus policies scoped through is_staff().
-- ----------------------------------------------------------------------------
alter table public.contact_messages enable row level security;
alter table public.contact_messages force row level security;

revoke all on public.contact_messages from anon, authenticated;
grant select, update (is_read) on public.contact_messages to authenticated;

create policy "staff can view contact messages"
  on public.contact_messages
  for select
  to authenticated
  using (public.is_staff());

create policy "staff can mark contact messages read"
  on public.contact_messages
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- No INSERT or DELETE policy for any client role: messages are created only
-- by the submit-contact Edge Function (service role, bypasses RLS) and are
-- never deleted through the app.
