# UKH Dental Clinic — Backend Implementation Plan

This is the plan the code in this repository follows. It exists so that
future changes (yours or an AI assistant's) stay consistent with the
security model instead of accidentally weakening it. If you change
something architectural, update this file in the same change.

Status: **implemented** for phases 0–6 and 9; **not yet implemented** for
phase 7 (email notifications), which was explicitly requested as a later
phase.

## 1. Architecture overview

```
                          ┌─────────────────────────────┐
   Patient's browser ───► │   Cloudflare Pages           │
                          │   (static site: index.html,  │
                          │    styles.css, script.js)    │
                          └───────────────┬───────────────┘
                                          │ POST (fetch, JSON)
                                          │ + Turnstile token
                                          ▼
                          ┌─────────────────────────────┐
                          │ Supabase Edge Function        │
                          │ submit-appointment (Deno)     │
                          │ - CORS / origin check         │
                          │ - honeypot check               │
                          │ - rate limit (hashed IP)       │
                          │ - Turnstile verification       │
                          │ - validation + sanitization    │
                          │ - duplicate check               │
                          │ - insert (service-role key)    │
                          └───────────────┬───────────────┘
                                          │ service-role (server-only)
                                          ▼
                          ┌─────────────────────────────┐
                          │ Supabase Postgres              │
                          │ - appointments                 │
                          │ - staff_profiles                │
                          │ - appointment_audit_log         │
                          │ - rate_limit_events              │
                          │ Row Level Security on all four  │
                          └───────────────┬───────────────┘
                                          ▲ authenticated (anon key + JWT)
                                          │ SELECT / UPDATE(status only)
                          ┌───────────────┴───────────────┐
   Staff's browser ─────► │ Cloudflare Pages                │
                          │ /staff/login.html                │
                          │ /staff/dashboard.html             │
                          │ (Supabase Auth session)            │
                          └─────────────────────────────────┘
```

Key property: **the anon key can never create, read, update, or delete an
appointment.** Patients create appointments only by going through the Edge
Function (which holds the service-role key server-side). Staff read/update
appointments only after signing in, and only because Row Level Security
grants access to rows in `staff_profiles` for their user — not because the
key they're using has any special privilege.

## 2. Phase-by-phase mapping to requirements

| # | Requirement | Where it's implemented |
|---|---|---|
| 1 | Patients submitting requests | `script.js` (`handleAppointmentSubmit`) → `submit-appointment` Edge Function |
| 2 | Server-side validation | `supabase/functions/_shared/validation.js` (`validateSubmission`) — the only validation with real authority |
| 3 | Duplicate + spam protection | Honeypot + Turnstile + rate limiting + duplicate-hash check, all in `submit-appointment/index.js` |
| 4 | Unique, non-sequential reference number | `generateReferenceNumber()` in `_shared/crypto.js` — 8 random chars from a 32-symbol alphabet, retried on collision |
| 5 | Appointment statuses | `appointment_status` enum in `0001_init_schema.sql`: pending, contacted, confirmed, completed, cancelled, no_show |
| 6 | Secure staff authentication | Supabase Auth (email/password), no public signup (`enable_signup = false` in `config.toml`). Invited staff set their own password via `staff/set-password.html` + `staff/set-password.js` — the account itself is still created by an admin |
| 7 | Protected staff dashboard | `staff/dashboard.html` + `staff/dashboard.js`, session-gated, data-gated by RLS |
| 8 | Staff viewing/searching/updating | `staff/dashboard.js` — client-side search/filter over fetched rows, status-only updates |
| 9 | English and Khmer messages | Patient-facing: `translations` + `SERVER_MESSAGE`-style codes in `script.js`. Staff dashboard is English-only for now — see "Known limitations" below |
| 10 | Email notifications (later phase) | Not implemented — see Phase 7 below |
| 11 | Audit records for staff changes | `appointment_audit_log` table + `log_appointment_change()` trigger (`0001_init_schema.sql`) |
| 12 | Dev/prod separation | Phase 8 below: two Supabase projects, Cloudflare Pages Preview vs Production environment variables |

## 3. Security requirements checklist

- [x] **No localStorage appointment storage** — removed entirely from `script.js`; nothing about an appointment is ever written to the browser.
- [x] **No public demo admin/CSV controls** — the whole `#admin` section, `loadRecords`/`exportRecordsAsCSV`/`clearRecords`, and `localStorage` code are deleted from `index.html`/`script.js`.
- [x] **Service-role key never in frontend code** — it exists only as a Supabase-provided Edge Function environment variable (`SUPABASE_SERVICE_ROLE_KEY`), read in `submit-appointment/index.js` via `Deno.env.get`. It is never referenced by `script.js`, `config.js`, `config.example.js`, or anything under `staff/`.
- [x] **Secrets only in server-side environment variables** — Turnstile secret key and the rate-limit salt are Supabase Edge Function secrets (`supabase secrets set`), documented in `supabase/.env.example`. The frontend's `config.js` holds only values that are meant to be public (anon key, Turnstile *site* key, Supabase URL, function URL).
- [x] **RLS enabled on every table** — `appointments`, `staff_profiles`, `appointment_audit_log`, `rate_limit_events` all have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` in `0002_rls_policies.sql`.
- [x] **Anonymous users can never list/read/update/delete appointments** — no policy grants `anon` anything, and `REVOKE ALL ... FROM anon` is explicit and separate from RLS as a second layer.
- [x] **Only authorized staff can access appointment data** — gated by `is_staff()`, which checks for an active row in `staff_profiles`, not just "is authenticated."
- [x] **Server-side validate/normalize/sanitize** — `_shared/validation.js`; trims, strips control characters and angle brackets, normalizes phone/email casing, enforces enums.
- [x] **Field length/value restrictions** — both at the Edge Function (`validation.js`) and again at the database (`CHECK` constraints in `0001_init_schema.sql`) — defense in depth.
- [x] **Rate limiting + Turnstile** — `rate_limit_events` table + `isRateLimited`/`recordRateLimitEvent`, and `verifyTurnstileToken` in `_shared/turnstile.js`.
- [x] **No dedicated medical-history field in the schema** — as of 2026-08-31, the booking form has an optional "Any medical conditions we should know about?" dropdown (High blood pressure / Diabetes / Allergies / Other, with a free-text description for the latter two) — this was an intentional product decision to collect this at intake, not an oversight. There is still no dedicated `medical_condition` column or enum anywhere in the schema: `buildMessageWithMedicalCondition()` in `script.js` folds the selection into the same capped (500-char) free-text `message` field already sent to staff, so it's stored and reviewed exactly like anything else a patient types in the message box — no new structured, separately-queryable medical data store was added.
- [x] **No patient data in URLs, analytics, or logs** — the form submits via POST body, not query params; there is no analytics integration in this project; every `console.log`/`console.error` in the Edge Function logs only event names, status codes, and the (non-identifying) reference number — never name/phone/email/message. See the top-of-file comment in `submit-appointment/index.js`.
- [x] **Submission is a request, not a confirmed appointment** — enforced in UI copy (`bookingDescription`, `faqFourA`, the success message) and in the data model itself (`status` starts at `pending`; nothing marks a row "confirmed" until staff do so).
- [x] **No invented clinic policies, credentials, or hours** — the placeholder contact details (`contactPhone`, `contactEmail`) from the original demo are left as-is for you to fill in; nothing new was invented. Staff accounts must be created by you (see Phase 6) — no default/sample credentials are included anywhere in this repo.
- [x] **`staff/set-password.html` cannot be used to create an account** — it only completes setup for a user an admin already invited (or resets a password for an email that already has a staff account); it never inserts into `auth.users` or `staff_profiles`, and it shows the same message regardless of whether the submitted email exists, so it can't be used to enumerate staff emails either.

## 4. Data model summary

See `supabase/migrations/0001_init_schema.sql` for the authoritative schema. Short version:

- **appointments** — one row per request. `reference_number` (patient-facing), contact fields, request details, `status`, `submission_hash` (dedup), `ip_hash` (rate limiting — hashed, never raw), `last_updated_by`.
- **staff_profiles** — one row per staff member, keyed to `auth.users.id`. Presence of an *active* row here is what "is staff" means everywhere in the system.
- **appointment_audit_log** — append-only, written only by a trigger (staff cannot insert into it directly), records every `status` change with who/when/old/new.
- **rate_limit_events** — minimal `(ip_hash, created_at)` rows, no form content, pruned after 24h by `prune_rate_limit_events()`.

## 5. Reference number format

`UKH-` followed by 8 characters drawn from a 32-symbol Crockford-style
alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0/O`, `1/I/L`, so it's
easy to read back over the phone). Generated with `crypto.getRandomValues`,
so it carries no information about submission order, and a `UNIQUE`
constraint plus retry-on-collision guarantees uniqueness. Example:
`UKH-7K3M9QXP`.

## 6. Spam and abuse protection, layered

1. **Honeypot field** (`website`) — invisible to real users, often filled by simple bots. Trips a silent rejection.
2. **Cloudflare Turnstile** — verified server-side against Cloudflare's `siteverify` endpoint using the secret key. Fails closed if misconfigured.
3. **Rate limiting** — max 5 submission attempts per hashed IP per 30 minutes (`RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MINUTES` in `index.js`), counted against every attempt (not just successful ones) to resist brute-force.
4. **Duplicate detection** — a hash of (email + phone + service + date) is checked against the last 10 minutes of submissions; a repeat returns the existing reference number instead of creating a new row.
5. **Server-side validation** — rejects anything that doesn't match the expected shape, regardless of what the client-side JS did or didn't check.

None of these depend on the others — Turnstile being briefly misconfigured
doesn't disable rate limiting, and vice versa.

## 7. Phase 7 (future): Email notifications

Not built yet, by design — the requirements listed it as optional/later.
When you're ready, the lowest-friction free-tier-compatible options are:

- **Resend** (free tier: 3,000 emails/month, 100/day) — call it from inside
  `submit-appointment/index.js` right after a successful insert (patient
  confirmation) and/or add a Postgres trigger + a second small Edge
  Function (`notify-staff`) invoked via `pg_net` or a Supabase Database
  Webhook on `INSERT INTO appointments` (staff notification).
- Keep the API key as another Edge Function secret (`RESEND_API_KEY`),
  never in frontend code, same pattern as `TURNSTILE_SECRET_KEY`.
- Failure handling matters here: if the email send fails, the appointment
  request must still succeed (email is a notification, not a precondition
  for saving the request) — wrap it in its own try/catch that only logs,
  never throws back to the client.
- Keep messages bilingual using the same `locale` column already stored on
  each appointment.

## 8. Deployment — from zero to running (free tier)

### 8.1 Create two Supabase projects

Create **two** projects at [supabase.com](https://supabase.com) (free
tier covers both comfortably at this scale): `ukh-dental-dev` and
`ukh-dental-prod`. Keeping them fully separate means a mistake in
development can never touch real patient data.

For each project, note down (Project Settings → API): the **Project URL**
and the **anon/public key**.

### 8.2 Install the Supabase CLI and link

```bash
npm install -g supabase
supabase login
cd ukh_dental_clinic
supabase link --project-ref <dev-project-ref>
```

### 8.3 Run the database migrations

```bash
supabase db push
```

This runs `0001_init_schema.sql` then `0002_rls_policies.sql` in order.
Repeat `supabase link --project-ref <prod-project-ref>` and `supabase db
push` again for the production project once you've verified dev works.

### 8.4 Create your first staff account

There is no public sign-up (`enable_signup = false`). Create the account
yourself:

1. Supabase Dashboard → Authentication → URL Configuration → add
   `<your-domain>/staff/set-password.html` to **Redirect URLs** (once per
   environment — see the comment above `additional_redirect_urls` in
   `supabase/config.toml`). This is what makes the invite email in the next
   step land the new staff member on a page where they can set their own
   password, instead of erroring.
2. Supabase Dashboard → Authentication → Users → **Add user** → **Send
   invite** (set their email; no password needed here — they set it
   themselves in step 4).
3. Supabase Dashboard → Table Editor → `staff_profiles` → insert a row:
   `user_id` = the new user's UUID (copy from the Users list),
   `display_name` = their name, `role` = `admin` for the first account,
   `is_active` = true.
4. The staff member opens the invite email and clicks the link, which takes
   them to `staff/set-password.html` to choose their password, then on to
   the dashboard. If a link ever expires, `staff/set-password.html` also
   lets them request a fresh one (this calls
   `supabase.auth.resetPasswordForEmail`, not a new account).

Repeat for each staff member. Do this once per environment (dev and prod
have entirely separate staff accounts). Note that step 2 (inviting the auth
user) and step 3 (the `staff_profiles` row) are both still admin-only
actions — `set-password.html` never creates either on its own, it only
lets someone already invited pick their own password.

### 8.5 Set up Cloudflare Turnstile

Cloudflare Dashboard → Turnstile → **Add widget**, one for dev (domain:
your `*.pages.dev` preview URL or `localhost`) and one for prod (your real
domain). Note the **Site Key** (public) and **Secret Key** (private) for
each.

### 8.6 Set Edge Function secrets

```bash
supabase link --project-ref <dev-project-ref>
supabase secrets set \
  TURNSTILE_SECRET_KEY=<dev-turnstile-secret> \
  RATE_LIMIT_SALT=$(openssl rand -hex 32) \
  ALLOWED_ORIGINS="http://localhost:8788,https://<your-dev-pages-subdomain>.pages.dev"
```

Repeat with the prod project ref, prod Turnstile secret, a *different*
random salt, and your real production domain(s) in `ALLOWED_ORIGINS`.

### 8.7 Deploy the Edge Function

```bash
supabase functions deploy submit-appointment
```

Run once per environment (after `supabase link`-ing to that project).

### 8.8 Set up Cloudflare Pages

Cloudflare Dashboard → Workers & Pages → **Create application → Pages →
Connect to Git**, pointing at this repository.

- **Build command:** `node scripts/generate-config.js`
- **Build output directory:** `/` (the repo root — `index.html` lives there)
- **Environment variables** (Settings → Environment variables), set
  **separately** for the *Preview* environment (dev) and the *Production*
  environment (prod):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUBMIT_APPOINTMENT_URL` (`${SUPABASE_URL}/functions/v1/submit-appointment`)
  - `TURNSTILE_SITE_KEY`

Cloudflare Pages' free tier covers this comfortably (unlimited requests,
500 builds/month).

### 8.9 Local development

```bash
cp config.example.js config.js   # fill in your DEV project's values
npx live-server --port=8788      # or: npm start
```

For the Edge Function locally:

```bash
cp supabase/.env.example supabase/.env.local   # fill in real dev values
supabase functions serve submit-appointment --env-file supabase/.env.local
```

Point `SUBMIT_APPOINTMENT_URL` in your local `config.js` at
`http://localhost:54321/functions/v1/submit-appointment` while doing this.

## 9. Testing checklist before go-live

- [ ] Submit a valid request end-to-end; confirm a row appears in `appointments` with `status = pending` and a `UKH-XXXXXXXX` reference number.
- [ ] Submit the same details twice within 10 minutes; confirm the second attempt returns `DUPLICATE_SUBMISSION` with the original reference number, not a new row.
- [ ] Submit 6+ times quickly from the same network; confirm the 6th returns `RATE_LIMITED`.
- [ ] Fill the hidden `website` field via devtools and submit; confirm it's rejected without a specific reason being revealed.
- [ ] Try each invalid input (bad email, bad phone, past date, date >120 days out, missing consent) and confirm both the client-side message and the server response reject it.
- [ ] Confirm an anonymous Supabase client (anon key, no session) cannot `select`, `insert`, `update`, or `delete` on `appointments` via the Supabase JS client or a raw REST call.
- [ ] Sign in as staff, confirm you can see and search appointments, and that changing status writes a new `appointment_audit_log` row.
- [ ] Try (as staff, via the REST API directly, not the dashboard UI) to change a field other than `status` — confirm the `enforce_appointment_update_fields` trigger rejects it.
- [ ] Sign in as a Supabase Auth user with **no** `staff_profiles` row — confirm `login.js` signs them back out and shows "not set up for staff access."
- [ ] Toggle the site to Khmer and confirm every patient-facing success/error message (not just the static UI text) renders in Khmer.

## 10. Known limitations / good next follow-ups

- The staff dashboard (`staff/login.html`, `staff/dashboard.html`) is
  English-only. Requirement 9 was scoped around patient-facing messages;
  extending the same `translations` pattern to the staff pages is a
  contained follow-up if needed.
- The dashboard fetches the most recent 200 appointments and searches/filters
  client-side. Fine at a single small clinic's volume; if that stops being
  true, switch to server-side pagination (`.range()`) and a Postgres
  full-text search using the `idx_appointments_search` GIN index already
  in place.
- The contact form (`#contact` section) remains a front-end-only demo, as
  it was before — only the appointment booking form was in scope for this
  backend.
- Hard deletion of an appointment is intentionally not exposed anywhere in
  the app (no delete policy, no delete UI) to protect the audit trail. If
  you need it for a specific compliance reason (e.g. a formal data-deletion
  request), that should stay a deliberate, logged, direct-database action —
  not a button in the UI.
- Email notifications: see Phase 7 above.
