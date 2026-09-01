// Copy this file to config.js for LOCAL development only
// (`cp config.example.js config.js`, then fill in your dev project's
// values). config.js is gitignored — never commit real keys.
//
// In Cloudflare Pages, config.js is generated automatically at build time
// by scripts/generate-config.js from the Pages project's environment
// variables (different values for the Preview/dev environment vs the
// Production environment). See BACKEND_PLAN.md, phase 7, for the exact
// Cloudflare Pages settings.
//
// Every value here is meant to be public: the Supabase anon key and the
// Turnstile SITE key are both designed to be shipped to the browser. The
// Supabase SERVICE ROLE key and the Turnstile SECRET key must NEVER appear
// in this file or anywhere in frontend code — they live only as Supabase
// Edge Function secrets (see supabase/.env.example).

window.APP_CONFIG = {
  // Project Settings -> API -> Project URL, for your DEV Supabase project.
  SUPABASE_URL: "https://YOUR-DEV-PROJECT-REF.supabase.co",

  // Project Settings -> API -> Project API keys -> anon / public.
  SUPABASE_ANON_KEY: "YOUR-DEV-ANON-KEY",

  // The deployed submit-appointment function URL for this environment,
  // i.e. `${SUPABASE_URL}/functions/v1/submit-appointment`.
  SUBMIT_APPOINTMENT_URL:
    "https://YOUR-DEV-PROJECT-REF.supabase.co/functions/v1/submit-appointment",

  // The deployed submit-contact function URL for this environment,
  // i.e. `${SUPABASE_URL}/functions/v1/submit-contact`.
  SUBMIT_CONTACT_URL:
    "https://YOUR-DEV-PROJECT-REF.supabase.co/functions/v1/submit-contact",

  // Cloudflare dashboard -> Turnstile -> your widget -> Site Key (public).
  TURNSTILE_SITE_KEY: "YOUR-DEV-TURNSTILE-SITE-KEY",
};
