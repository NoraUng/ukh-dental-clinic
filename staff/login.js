// staff/login.js
// Loaded as a module. Uses the Supabase anon key only — the anon key is
// public by design and cannot read appointment data on its own; RLS
// (0002_rls_policies.sql) is what actually gates access once signed in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_CONFIG = window.APP_CONFIG || {};

if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
  console.error(
    "APP_CONFIG is missing SUPABASE_URL/SUPABASE_ANON_KEY. Did you create ../config.js?",
  );
}

const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const loginAlert = document.getElementById("loginAlert");
const emailInput = document.getElementById("staffEmail");
const passwordInput = document.getElementById("staffPassword");

function showAlert(kind, message) {
  loginAlert.className = `alert ${kind}`;
  loginAlert.textContent = message;
}

function setSubmitting(isSubmitting) {
  loginButton.disabled = isSubmitting;
  loginButton.textContent = isSubmitting ? "Signing in…" : "Sign In";
}

/**
 * A valid Supabase Auth session isn't enough on its own — it only proves
 * "this is *a* logged-in user", not "this user is clinic staff". The real
 * gate is whether they have an active row in staff_profiles, which is what
 * every RLS policy on appointment data actually checks (see is_staff() in
 * 0002_rls_policies.sql). We check the same thing here so an
 * authenticated-but-not-staff account gets a clear message instead of a
 * dashboard that quietly shows no data.
 */
async function currentUserIsStaff() {
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("user_id")
    .maybeSingle();
  return !error && !!data;
}

async function redirectIfAlreadyStaffSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  if (await currentUserIsStaff()) {
    window.location.replace("./dashboard.html");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert("", "");
  setSubmitting(true);

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    setSubmitting(false);
    showAlert("error-alert", "Invalid email or password.");
    return;
  }

  if (!(await currentUserIsStaff())) {
    await supabase.auth.signOut();
    setSubmitting(false);
    showAlert(
      "error-alert",
      "This account is not set up for staff access. Contact a clinic administrator.",
    );
    return;
  }

  window.location.replace("./dashboard.html");
});

redirectIfAlreadyStaffSession();
