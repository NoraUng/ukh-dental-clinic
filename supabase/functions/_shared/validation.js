// Server-side validation, normalization, and sanitization for appointment
// submissions. This is the ONLY place field rules are enforced with any
// real authority — the browser-side checks in script.js are a UX
// convenience, not a security boundary, and a request can always arrive
// here having skipped them entirely.

// Maps the values the public form actually sends (matching the existing
// <option> text in index.html) to the Postgres enum values in
// 0001_init_schema.sql. Keeping this mapping here (rather than changing the
// enum to match the UI strings) keeps the database schema stable even if
// the marketing copy on the public page changes later.
export const SERVICE_MAP = {
  "Dental Cleaning & Checkup": "dental_cleaning_checkup",
  "Tooth Filling": "tooth_filling",
  "Teeth Whitening": "teeth_whitening",
  "Root Canal Care": "root_canal_care",
  "Braces & Aligners": "braces_aligners",
  "Emergency Visit": "emergency_visit",
};

export const DOCTOR_MAP = {
  "Dr. Nory Ung": "dr_nory_ung",
  "Dr. Muy Chem": "dr_muy_chem",
  "No preference": "no_preference",
};

export const PATIENT_TYPE_MAP = {
  "New patient": "new",
  "Returning patient": "returning",
};

// Canonical list of bookable time slots. Must match createTimeOptions() in
// script.js — if you add/remove a slot there, update this list too.
export const ALLOWED_TIMES = new Set([
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM",
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM",
]);

export const MAX_BOOKING_WINDOW_DAYS = 120;
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\s'.-]{1,99}$/u;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const PHONE_CLEAN_PATTERN = /[^\d+]/g;
const PHONE_PATTERN = /^\+?[0-9]{6,15}$/;

function stripControlAndTags(value) {
  // Remove angle brackets (defense-in-depth against stored HTML/script,
  // the dashboard also escapes on render) and ASCII control characters,
  // then collapse internal whitespace runs. Built with codePointAt
  // rather than a regex control-character class to avoid any ambiguity
  // around escaped control bytes ending up literally in source.
  let cleaned = "";
  for (const char of value.replace(/[<>]/g, "")) {
    const code = char.codePointAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      cleaned += char;
    }
  }
  return cleaned.replace(/\s+/g, " ").trim();
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Validates and normalizes a raw submission body.
 * Returns { ok: true, data } or { ok: false, fieldErrors }.
 * `fieldErrors` maps field name -> short error code (never echoes the
 * visitor's own input back, to avoid reflecting anything unexpected).
 */
export function validateSubmission(raw) {
  const fieldErrors = {};

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, fieldErrors: { _form: "INVALID_BODY" } };
  }

  const fullNameRaw = stripControlAndTags(String(raw.fullName ?? ""));
  const phoneDigits = String(raw.phone ?? "").replace(PHONE_CLEAN_PATTERN, "");
  const emailRaw = stripControlAndTags(String(raw.email ?? "")).toLowerCase();
  const patientTypeRaw = String(raw.patientType ?? "");
  const serviceRaw = String(raw.service ?? "");
  const doctorRaw = String(raw.preferredDoctor ?? "");
  const dateRaw = String(raw.preferredDate ?? "");
  const timeRaw = String(raw.preferredTime ?? "");
  const messageRaw = stripControlAndTags(String(raw.message ?? "")).slice(0, 500);
  const consentRaw = raw.consent;
  const localeRaw = raw.locale === "km" ? "km" : "en";

  if (!NAME_PATTERN.test(fullNameRaw)) {
    fieldErrors.fullName = "INVALID_NAME";
  }

  if (!PHONE_PATTERN.test(phoneDigits)) {
    fieldErrors.phone = "INVALID_PHONE";
  }

  // Email is optional — only validate its format if the patient entered one.
  if (emailRaw && (!EMAIL_PATTERN.test(emailRaw) || emailRaw.length > 254)) {
    fieldErrors.email = "INVALID_EMAIL";
  }

  const patientType = PATIENT_TYPE_MAP[patientTypeRaw];
  if (!patientType) {
    fieldErrors.patientType = "INVALID_PATIENT_TYPE";
  }

  const service = SERVICE_MAP[serviceRaw];
  if (!service) {
    fieldErrors.service = "INVALID_SERVICE";
  }

  const preferredDoctor = DOCTOR_MAP[doctorRaw];
  if (!preferredDoctor) {
    fieldErrors.preferredDoctor = "INVALID_DOCTOR";
  }

  let preferredDate = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const parsed = new Date(`${dateRaw}T00:00:00Z`);
    const today = todayUTC();
    const maxDate = new Date(today);
    maxDate.setUTCDate(maxDate.getUTCDate() + MAX_BOOKING_WINDOW_DAYS);

    if (Number.isNaN(parsed.getTime())) {
      fieldErrors.preferredDate = "INVALID_DATE";
    } else if (parsed < today) {
      fieldErrors.preferredDate = "DATE_IN_PAST";
    } else if (parsed > maxDate) {
      fieldErrors.preferredDate = "DATE_TOO_FAR";
    } else {
      preferredDate = dateRaw;
    }
  } else {
    fieldErrors.preferredDate = "INVALID_DATE";
  }

  if (!ALLOWED_TIMES.has(timeRaw)) {
    fieldErrors.preferredTime = "INVALID_TIME";
  }

  if (consentRaw !== true) {
    fieldErrors.consent = "CONSENT_REQUIRED";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  return {
    ok: true,
    data: {
      fullName: fullNameRaw,
      phone: phoneDigits,
      email: emailRaw || null,
      patientType,
      service,
      preferredDoctor,
      preferredDate,
      preferredTime: timeRaw,
      message: messageRaw || null,
      consent: true,
      locale: localeRaw,
    },
  };
}

// A hidden form field (see index.html's honeypot input) that a human never
// fills in but a naive bot script often does. Any non-empty value here
// means the submission is treated as spam without revealing why.
export function isHoneypotTripped(raw) {
  const value = raw && typeof raw === "object" ? raw.website : undefined;
  return typeof value === "string" && value.trim().length > 0;
}
