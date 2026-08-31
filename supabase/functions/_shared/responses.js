// All responses use a stable `code` (never a hard-coded English/Khmer
// string) so the frontend can render the message in whichever language the
// visitor is using. See script.js's SERVER_MESSAGE_CODES map for the actual
// EN/KM copy. Keep this list and that map in sync when adding a new code.

export function jsonResponse(status, body, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export const CODES = {
  SUCCESS: "SUCCESS",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  SPAM_DETECTED: "SPAM_DETECTED",
  RATE_LIMITED: "RATE_LIMITED",
  DUPLICATE_SUBMISSION: "DUPLICATE_SUBMISSION",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  ORIGIN_NOT_ALLOWED: "ORIGIN_NOT_ALLOWED",
  MALFORMED_REQUEST: "MALFORMED_REQUEST",
  SERVER_ERROR: "SERVER_ERROR",
};
