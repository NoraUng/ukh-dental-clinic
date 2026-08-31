// staff/set-password.js
//
// This page does NOT create staff accounts — that stays admin-only (see
// BACKEND_PLAN.md, phase 8.4: create the auth user + a staff_profiles row
// via the Supabase Dashboard). It only lets someone who already has an
// admin-issued invite or password-reset link finish setting up their own
// password, using the Supabase session that link establishes. Landing here
// with no such link just offers a way to request a fresh reset email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const APP_CONFIG = window.APP_CONFIG || {};

if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
  console.error(
    "APP_CONFIG is missing SUPABASE_URL/SUPABASE_ANON_KEY. Did you create ../config.js?",
  );
}

const supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);

const requestView = document.getElementById("requestView");
const passwordView = document.getElementById("passwordView");

const requestForm = document.getElementById("requestForm");
const requestButton = document.getElementById("requestButton");
const requestAlert = document.getElementById("requestAlert");
const requestEmailInput = document.getElementById("requestEmail");

const passwordForm = document.getElementById("passwordForm");
const passwordButton = document.getElementById("passwordButton");
const passwordAlert = document.getElementById("passwordAlert");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");

function showAlert(alertElement, kind, message) {
  alertElement.className = `alert ${kind}`;
  alertElement.textContent = message;
}

function showView(view) {
  requestView.hidden = view !== "request";
  passwordView.hidden = view !== "password";
}

/**
 * An expired or already-used invite/recovery link redirects here with
 * `#error=...&error_description=...` instead of a session. Surface that
 * reason on the request form rather than silently falling back to it.
 */
function showLinkErrorIfPresent() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorDescription = hashParams.get("error_description");
  if (errorDescription) {
    showAlert(requestAlert, "error-alert", errorDescription.replace(/\+/g, " "));
    history.replaceState(null, "", window.location.pathname);
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
    showView("password");
  }
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(requestAlert, "", "");
  requestButton.disabled = true;
  requestButton.textContent = "Sending…";

  const email = requestEmailInput.value.trim();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/staff/set-password.html`,
  });

  requestButton.disabled = false;
  requestButton.textContent = "Send Reset Link";
  requestForm.reset();
  // Same message whether or not the email belongs to a staff account, so
  // this form can't be used to discover which emails have staff access.
  showAlert(
    requestAlert,
    "success",
    "If that email has a staff account, a reset link is on its way.",
  );
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showAlert(passwordAlert, "", "");

  const password = newPasswordInput.value;
  if (password.length < 8) {
    showAlert(passwordAlert, "error-alert", "Password must be at least 8 characters.");
    return;
  }
  if (password !== confirmPasswordInput.value) {
    showAlert(passwordAlert, "error-alert", "Passwords do not match.");
    return;
  }

  passwordButton.disabled = true;
  passwordButton.textContent = "Saving…";

  const { error } = await supabase.auth.updateUser({ password });

  passwordButton.disabled = false;
  passwordButton.textContent = "Set Password";

  if (error) {
    showAlert(passwordAlert, "error-alert", error.message);
    return;
  }

  showAlert(passwordAlert, "success", "Password set. Redirecting to the dashboard…");
  setTimeout(() => window.location.replace("./dashboard.html"), 1200);
});

(async function start() {
  showLinkErrorIfPresent();
  const { data } = await supabase.auth.getSession();
  showView(data.session ? "password" : "request");
})();
