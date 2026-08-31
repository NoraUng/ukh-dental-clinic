-- Functional RLS/trigger tests against the schema from 0001+0002.
-- Run as the postgres superuser; uses SET ROLE + request.jwt.claim.sub to
-- simulate anon / a specific authenticated (staff) user, the same way
-- PostgREST does in a real Supabase project.
\set ON_ERROR_STOP off

\echo '--- setup: two staff users, one non-staff auth user ---'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'staff@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'notstaff@example.com');

insert into public.staff_profiles (user_id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Admin Staff', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'Front Desk', 'staff');

\echo '--- setup: one appointment, inserted as service_role (simulating the Edge Function) ---'
set role service_role;
insert into public.appointments
  (reference_number, full_name, phone, email, patient_type, service, preferred_doctor,
   preferred_date, preferred_time, consent, submission_hash)
values
  ('UKH-TEST0001', 'Nora Ung', '+85512345678', 'nora@example.com', 'new',
   'dental_cleaning_checkup', 'dr_nory_ung', current_date + 1, '9:00 AM', true, 'testhash1');
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 1: anon cannot select appointments (expect 0 rows) ==='
set role anon;
select count(*) as anon_can_see from public.appointments;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 2: anon cannot insert an appointment (expect ERROR: permission denied) ==='
set role anon;
insert into public.appointments
  (reference_number, full_name, phone, email, patient_type, service, preferred_doctor,
   preferred_date, preferred_time, consent, submission_hash)
values
  ('UKH-HACKED1', 'Evil Bot', '+85500000000', 'evil@example.com', 'new',
   'dental_cleaning_checkup', 'dr_nory_ung', current_date + 1, '9:00 AM', true, 'evilhash');
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 3: a non-staff authenticated user sees 0 appointments ==='
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as notstaff_can_see from public.appointments;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 4: a real staff member CAN see the appointment ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select reference_number, status from public.appointments;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 5: staff can update status (pending -> contacted), audit row is created ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.appointments set status = 'contacted' where reference_number = 'UKH-TEST0001';
select status, last_updated_by from public.appointments where reference_number = 'UKH-TEST0001';
reset role;
reset request.jwt.claim.sub;

set role service_role;
select field_changed, old_value, new_value, changed_by from public.appointment_audit_log;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 6: staff CANNOT change full_name (expect ERROR: Only appointment status...) ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.appointments set full_name = 'Someone Else' where reference_number = 'UKH-TEST0001';
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 7: staff can read the audit log ==='
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as audit_rows_visible_to_staff from public.appointment_audit_log;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 8: anon cannot read the audit log (expect 0) ==='
set role anon;
select count(*) as audit_rows_visible_to_anon from public.appointment_audit_log;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 9: constraint check — consent must be true (expect ERROR) ==='
set role service_role;
insert into public.appointments
  (reference_number, full_name, phone, email, patient_type, service, preferred_doctor,
   preferred_date, preferred_time, consent, submission_hash)
values
  ('UKH-TEST0002', 'No Consent', '+85511111111', 'noconsent@example.com', 'new',
   'dental_cleaning_checkup', 'dr_nory_ung', current_date + 1, '9:00 AM', false, 'testhash2');
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 10: constraint check — bad enum value is rejected (expect ERROR) ==='
set role service_role;
insert into public.appointments
  (reference_number, full_name, phone, email, patient_type, service, preferred_doctor,
   preferred_date, preferred_time, consent, submission_hash)
values
  ('UKH-TEST0003', 'Bad Service', '+85511111112', 'badservice@example.com', 'new',
   'not_a_real_service', 'dr_nory_ung', current_date + 1, '9:00 AM', true, 'testhash3');
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 11: reference_number uniqueness is enforced (expect ERROR: duplicate key) ==='
set role service_role;
insert into public.appointments
  (reference_number, full_name, phone, email, patient_type, service, preferred_doctor,
   preferred_date, preferred_time, consent, submission_hash)
values
  ('UKH-TEST0001', 'Duplicate Ref', '+85511111113', 'dup@example.com', 'new',
   'dental_cleaning_checkup', 'dr_nory_ung', current_date + 1, '9:00 AM', true, 'testhash4');
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== TEST 12: rate_limit_events is unreadable by anon and authenticated (expect 0 both) ==='
set role service_role;
insert into public.rate_limit_events (ip_hash) values ('deadbeef');
reset role;
reset request.jwt.claim.sub;
set role anon;
select count(*) as anon_sees_rate_limit from public.rate_limit_events;
reset role;
reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as staff_sees_rate_limit from public.rate_limit_events;
reset role;
reset request.jwt.claim.sub;

\echo ''
\echo '=== ALL TESTS EXECUTED ==='
