# Migration tests

These files are **not part of the deployed project** — nothing under
`test/` is referenced by the app, and nothing here should be pushed to
Supabase. They exist to verify that `supabase/migrations/0001_init_schema.sql`
and `0002_rls_policies.sql` actually do what `BACKEND_PLAN.md` claims,
against a real Postgres instance (not just "the SQL parses").

## What's tested

`01_functional_tests.sql` exercises, by switching Postgres role and setting
`request.jwt.claim.sub` the way PostgREST does:

- Anonymous (`anon`) users cannot select or insert appointments.
- A signed-in user with no `staff_profiles` row sees zero appointments.
- A real staff member can see appointments, update `status`, and that
  update is recorded in `appointment_audit_log` automatically.
- A staff member cannot change any column other than `status` (blocked at
  the column-privilege level before the enforcement trigger even runs —
  two independent layers, both verified here).
- `appointment_audit_log` and `rate_limit_events` are unreadable by anyone
  but `service_role`.
- The `consent = true` check constraint, the enum check on `service`, and
  the `reference_number` uniqueness constraint all reject bad data.

## Running it yourself

Requires a local Postgres (v15+) you're comfortable creating a scratch
database in — this does **not** touch your real Supabase project.

```bash
createdb ukh_test
psql -v ON_ERROR_STOP=1 -d ukh_test -f test/00_supabase_stub.sql
psql -v ON_ERROR_STOP=1 -d ukh_test -f ../supabase/migrations/0001_init_schema.sql
psql -v ON_ERROR_STOP=1 -d ukh_test -f ../supabase/migrations/0002_rls_policies.sql
psql -v ON_ERROR_STOP=1 -d ukh_test -f test/02_grant_service_role_post.sql
psql -d ukh_test -f test/01_functional_tests.sql
dropdb ukh_test   # clean up when done
```

`00_supabase_stub.sql` and `02_grant_service_role_post.sql` recreate just
enough of what a real Supabase project provisions automatically (the
`auth.users` table, `auth.uid()`, and the `anon`/`authenticated`/
`service_role` roles with their platform-level grants) so the migrations
can run standalone. You do **not** need either file against a real
Supabase project — it already has all of this.

Expect several `ERROR:` lines in the output — most tests intentionally
attempt something that should fail (e.g. "anon cannot insert") and the
`\echo` line right above each block says what to expect.
