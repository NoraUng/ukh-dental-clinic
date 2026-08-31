// Shared CORS handling for all Edge Functions.
//
// ALLOWED_ORIGINS is a comma-separated env secret, e.g.:
//   dev:  "http://localhost:8788,https://ukh-dental-dev.pages.dev"
//   prod: "https://ukhdentalclinic.com,https://ukh-dental.pages.dev"
// Only an exact match is ever reflected back — there is no wildcard "*" in
// production because appointment data must never be readable from an
// arbitrary origin.

export function getAllowedOrigins() {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(requestOrigin) {
  const allowedOrigins = getAllowedOrigins();
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  }

  return headers;
}

export function handlePreflight(req) {
  if (req.method !== "OPTIONS") return null;
  const origin = req.headers.get("origin") ?? "";
  return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
}
