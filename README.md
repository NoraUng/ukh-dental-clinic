# Ung Kheang Heang Dental Clinic Website

A front-end website with a real (free-tier) backend for **Ung Kheang Heang
Dental Clinic** in Phnom Penh, Cambodia: patients submit appointment
requests, clinic staff review and manage them through a protected
dashboard.

## Stack

- **Frontend:** plain HTML/CSS/JS, no framework or build step, hosted on
  **Cloudflare Pages**.
- **Backend:** **Supabase** — Postgres (with Row Level Security),
  Edge Functions, and Auth.
- **Spam protection:** **Cloudflare Turnstile**.
- Everything runs on free tiers. See `BACKEND_PLAN.md` for the full
  architecture, security checklist, and deployment steps.

## What's included

- Responsive public site: services, doctor profiles, testimonials, FAQ,
  English/Khmer language toggle.
- An appointment booking form that submits to a Supabase Edge Function,
  which validates, sanitizes, checks for spam/duplicates/rate limits, and
  stores the request in Postgres.
- A protected staff dashboard (`/staff/`) — Supabase Auth login, then a
  searchable table of appointment requests staff can update the status of
  (pending → contacted → confirmed → completed / cancelled / no-show).
- A full audit trail of status changes, and Row Level Security so
  anonymous visitors can never read, list, update, or delete appointment
  data — only signed-in staff can.
- A contact form that remains a client-only demo (not wired to a backend).

**Read `BACKEND_PLAN.md` before deploying** — it has the complete
architecture diagram, a requirement-by-requirement checklist of what's
implemented, and step-by-step setup instructions for Supabase and
Cloudflare Pages.

## Quick start (local development)

```bash
# 1. Frontend config
cp config.example.js config.js
# edit config.js with your DEV Supabase project's URL/anon key,
# your local or dev submit-appointment function URL, and your DEV
# Turnstile site key.

# 2. Serve the static site
npm start   # or: npx live-server --port=8788

# 3. (separate terminal) Run the Edge Function locally
cp supabase/.env.example supabase/.env.local
# edit supabase/.env.local with real dev values
supabase functions serve submit-appointment --env-file supabase/.env.local
```

You'll need a Supabase project and the Supabase CLI installed
(`npm install -g supabase`) before step 3 will work — see `BACKEND_PLAN.md`
section 8 for creating and configuring the project from scratch.

## Files

```text
ukh_dental_clinic/
├── index.html                     public site
├── styles.css
├── script.js
├── config.example.js              copy to config.js for local dev (gitignored)
├── scripts/
│   └── generate-config.js         writes config.js at Cloudflare Pages build time
├── staff/
│   ├── login.html                 staff sign-in (Supabase Auth)
│   ├── login.js
│   ├── dashboard.html             protected appointments dashboard
│   ├── dashboard.js
│   └── staff.css
├── supabase/
│   ├── config.toml
│   ├── .env.example                Edge Function secrets — documents what to set, values live in Supabase's secret store
│   ├── migrations/
│   │   ├── 0001_init_schema.sql    tables, enums, indexes, triggers
│   │   └── 0002_rls_policies.sql   Row Level Security policies
│   └── functions/
│       ├── submit-appointment/     the only way an appointment row is created
│       └── _shared/                validation, Turnstile, CORS, crypto helpers
├── BACKEND_PLAN.md                 full architecture, security checklist, deployment guide
├── package.json
└── README.md
```

## Security model, in one paragraph

The public site never talks to Postgres directly for appointments — it
calls a Supabase Edge Function, which alone holds the service-role key (as
a server-side secret, never shipped to the browser) and performs
validation, Turnstile verification, rate limiting, and duplicate checks
before inserting a row. The anon key used by the public site and by the
staff dashboard has no special privileges of its own; Row Level Security,
enabled on every table, is what actually decides who can see what — and by
default that's nobody except a signed-in user with an active row in
`staff_profiles`. Full details and the complete checklist are in
`BACKEND_PLAN.md`.

## Things to edit before publishing

- Real clinic street address, phone number, and email (in `index.html`'s
  contact section and translations in `script.js`).
- Real doctor photos.
- Real service prices, if needed.
- Real patient testimonials.
- A privacy policy.
- Email notifications (optional, planned as a later phase — see
  `BACKEND_PLAN.md` section 7).
