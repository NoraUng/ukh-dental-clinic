// supabase/functions/submit-contact/index.ts
//
// Public entry point for the general "Send a Message" contact form. Same
// security shape as submit-appointment: only the service-role key (never
// sent to the browser) can insert into contact_messages, so anonymous
// visitors go through this function, never PostgREST directly.
//
// Request flow mirrors submit-appointment/index.ts:
//   1. CORS / method checks
//   2. Parse + size-limit the JSON body
//   3. Honeypot check (silent reject, no detail leaked)
//   4. Rate limit by hashed IP (shares the same rate_limit_events table)
//   5. Cloudflare Turnstile verification
//   6. Server-side validation + normalization
//   7. Insert
//
// The rate-limit/service-client helpers below are intentionally duplicated
// from submit-appointment/index.ts rather than shared, to keep each
// function's deploy fully self-contained — see that file for the same
// logic with more detailed comments.
//
// Logging never includes name/email/message — only event names and status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { CODES, jsonResponse } from "../_shared/responses.js";
import { isHoneypotTripped, validateContactSubmission } from "../_shared/validation.js";
import { verifyTurnstileToken } from "../_shared/turnstile.js";
import { hmacSha256Hex } from "../_shared/crypto.js";

const MAX_BODY_BYTES = 5 * 1024;
const RATE_LIMIT_WINDOW_MINUTES = 30;
const RATE_LIMIT_MAX_REQUESTS = 5;

function getServiceRoleClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function isRateLimited(supabase, ipHash) {
  if (!ipHash) return false;

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("rate_limit_events")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", windowStart);

  if (error) {
    console.error(JSON.stringify({ event: "rate_limit_query_failed", message: error.message }));
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

Deno.serve(async (req) => {
  const preflightResponse = handlePreflight(req);
  if (preflightResponse) return preflightResponse;

  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method !== "POST") {
    return jsonResponse(405, { code: CODES.METHOD_NOT_ALLOWED }, corsHeaders);
  }

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

  await recordRateLimitEvent(supabase, ipHash);

  const turnstileOk = await verifyTurnstileToken(raw?.turnstileToken, ip ?? undefined);
  if (!turnstileOk) {
    console.log(JSON.stringify({ event: "turnstile_failed" }));
    return jsonResponse(400, { code: CODES.SPAM_DETECTED }, corsHeaders);
  }

  const validation = validateContactSubmission(raw);
  if (!validation.ok) {
    return jsonResponse(
      400,
      { code: CODES.VALIDATION_ERROR, fieldErrors: validation.fieldErrors },
      corsHeaders,
    );
  }

  const { data } = validation;

  try {
    const { error } = await supabase.from("contact_messages").insert({
      full_name: data.fullName,
      email: data.email,
      message: data.message,
      ip_hash: ipHash,
    });

    if (error) throw error;

    console.log(JSON.stringify({ event: "contact_message_created" }));
    return jsonResponse(201, { code: CODES.SUCCESS }, corsHeaders);
  } catch (error) {
    console.error(JSON.stringify({ event: "insert_failed", message: String(error?.message ?? error) }));
    return jsonResponse(500, { code: CODES.SERVER_ERROR }, corsHeaders);
  }
});
