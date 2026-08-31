// supabase/functions/submit-appointment/index.js
//
// Public entry point for the appointment booking form. This is the ONLY
// way an appointment row is ever created — the public site never talks to
// Postgres/PostgREST directly for this, and the anon key has no INSERT
// grant on `appointments` at all (see 0002_rls_policies.sql). This
// function alone holds the service-role key, read from a server-side
// environment variable that is never sent to the browser.
//
// Request flow:
//   1. CORS / method checks
//   2. Parse + size-limit the JSON body
//   3. Honeypot check (silent reject, no detail leaked)
//   4. Rate limit by hashed IP
//   5. Cloudflare Turnstile verification
//   6. Server-side validation + normalization (the real security boundary)
//   7. Duplicate-submission check
//   8. Insert with a randomly generated, non-sequential reference number
//
// Logging never includes name/phone/email/message — only event names,
// status codes, and the (non-identifying) reference number.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { CODES, jsonResponse } from "../_shared/responses.js";
import { isHoneypotTripped, validateSubmission } from "../_shared/validation.js";
import { verifyTurnstileToken } from "../_shared/turnstile.js";
import { generateReferenceNumber, hmacSha256Hex, sha256Hex } from "../_shared/crypto.js";

const MAX_BODY_BYTES = 10 * 1024; // 10 KB is generous for this form
const RATE_LIMIT_WINDOW_MINUTES = 30;
const RATE_LIMIT_MAX_REQUESTS = 5;
const DUPLICATE_WINDOW_MINUTES = 10;
const MAX_REFERENCE_RETRIES = 5;

function getServiceRoleClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret");
  }
  // No session persistence needed — this client is created fresh per
  // request and used for a handful of server-side queries only.
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req) {
  // Cloudflare Pages/Workers set this reliably when the request comes
  // through Cloudflare's edge. x-forwarded-for is a fallback for local
  // `supabase functions serve` testing.
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function isRateLimited(supabase, ipHash) {
  if (!ipHash) return false; // can't rate-limit what we can't identify

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_query_failed", message: error.message }));
    // Fail open on a query error rather than blocking every legitimate
    // submission because of a transient DB issue; Turnstile + validation
    // still apply.
    return false;
  }

  return (count ?? 0) >= RATE_LIMIT_MAX_REQUESTS;
}

async function recordRateLimitEvent(supabase, ipHash) {
  if (!ipHash) return;
  const { error } = await supabase.from("rate_limit_events").insert({ ip_hash: ipHash });
  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_insert_failed", message: error.message }));
  }
}

async function findRecentDuplicate(supabase, submissionHash) {
  const windowStart = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("reference_number")
    .eq("submission_hash", submissionHash)
    .gte("created_at", windowStart)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(JSON.stringify({ event: "duplicate_check_failed", message: error.message }));
    return null;
  }

  return data?.reference_number ?? null;
}

async function insertAppointmentWithRetries(supabase, appointmentData) {
  for (let attempt = 0; attempt < MAX_REFERENCE_RETRIES; attempt++) {
    const referenceNumber = generateReferenceNumber();
    const { error } = await supabase
      .from("appointments")
      .insert({ ...appointmentData, reference_number: referenceNumber });

    if (!error) {
      return referenceNumber;
    }

    // 23505 = unique_violation. Only retry on a reference-number collision
    // (astronomically unlikely, but the retry is cheap); anything else is
    // a real failure and should surface immediately.
    if (error.code !== "23505") {
      throw error;
    }
  }

  throw new Error("Could not generate a unique reference number after several attempts");
}

Deno.serve(async (req) => {
  const preflightResponse = handlePreflight(req);
  if (preflightResponse) return preflightResponse;

  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method !== "POST") {
    return jsonResponse(405, { code: CODES.METHOD_NOT_ALLOWED }, corsHeaders);
  }

  // If an Origin header was sent but didn't make it into the allow-list,
  // reject explicitly rather than silently proceeding without CORS headers.
  if (origin && !corsHeaders["Access-Control-Allow-Origin"]) {
    return jsonResponse(403, { code: CODES.ORIGIN_NOT_ALLOWED }, corsHeaders);
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { code: CODES.MALFORMED_REQUEST }, corsHeaders);
  }

  let raw;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse(413, { code: CODES.MALFORMED_REQUEST }, corsHeaders);
    }
    raw = JSON.parse(text);
  } catch {
    return jsonResponse(400, { code: CODES.MALFORMED_REQUEST }, corsHeaders);
  }

  // Silently reject bot traffic that filled in the hidden honeypot field,
  // without revealing that a honeypot was the reason.
  if (isHoneypotTripped(raw)) {
    console.log(JSON.stringify({ event: "honeypot_tripped" }));
    return jsonResponse(400, { code: CODES.SPAM_DETECTED }, corsHeaders);
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(JSON.stringify({ event: "config_error", message: String(error) }));
    return jsonResponse(500, { code: CODES.SERVER_ERROR }, corsHeaders);
  }

  const ip = getClientIp(req);
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT") ?? "";
  const ipHash = ip && rateLimitSalt ? await hmacSha256Hex(ip, rateLimitSalt) : null;

  if (await isRateLimited(supabase, ipHash)) {
    console.log(JSON.stringify({ event: "rate_limited" }));
    return jsonResponse(429, { code: CODES.RATE_LIMITED }, corsHeaders);
  }

  // Record this attempt against the rate limit before doing further work,
  // so a burst of requests (even ones that fail validation) still counts.
  await recordRateLimitEvent(supabase, ipHash);

  const turnstileOk = await verifyTurnstileToken(raw?.turnstileToken, ip ?? undefined);
  if (!turnstileOk) {
    console.log(JSON.stringify({ event: "turnstile_failed" }));
    return jsonResponse(400, { code: CODES.SPAM_DETECTED }, corsHeaders);
  }

  const validation = validateSubmission(raw);
  if (!validation.ok) {
    return jsonResponse(
      400,
      { code: CODES.VALIDATION_ERROR, fieldErrors: validation.fieldErrors },
      corsHeaders,
    );
  }

  const { data } = validation;
  const submissionHash = await sha256Hex(
    `${data.email}|${data.phone}|${data.service}|${data.preferredDate}`,
  );

  const existingReference = await findRecentDuplicate(supabase, submissionHash);
  if (existingReference) {
    console.log(JSON.stringify({ event: "duplicate_submission" }));
    return jsonResponse(
      409,
      { code: CODES.DUPLICATE_SUBMISSION, referenceNumber: existingReference },
      corsHeaders,
    );
  }

  try {
    const referenceNumber = await insertAppointmentWithRetries(supabase, {
      full_name: data.fullName,
      phone: data.phone,
      email: data.email,
      patient_type: data.patientType,
      service: data.service,
      preferred_doctor: data.preferredDoctor,
      preferred_date: data.preferredDate,
      preferred_time: data.preferredTime,
      message: data.message,
      consent: data.consent,
      locale: data.locale,
      submission_hash: submissionHash,
      ip_hash: ipHash,
    });

    console.log(JSON.stringify({ event: "appointment_created", referenceNumber, service: data.service }));

    return jsonResponse(201, { code: CODES.SUCCESS, referenceNumber }, corsHeaders);
  } catch (error) {
    console.error(JSON.stringify({ event: "insert_failed", message: String(error?.message ?? error) }));
    return jsonResponse(500, { code: CODES.SERVER_ERROR }, corsHeaders);
  }
});
