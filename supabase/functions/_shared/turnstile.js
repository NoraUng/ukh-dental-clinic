// Cloudflare Turnstile server-side verification.
// The site key (public) lives in the frontend; the secret key (private)
// lives only here, as a Supabase Edge Function secret — never shipped to
// the browser.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * @param {string} token - the token the widget put in cf-turnstile-response
 * @param {string | undefined} remoteIp - the visitor's IP, if known
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstileToken(token, remoteIp) {
  const secretKey = Deno.env.get("TURNSTILE_SECRET_KEY");

  if (!secretKey) {
    // Fail closed: if the secret isn't configured, treat every submission
    // as unverified rather than silently skipping spam protection.
    console.error(JSON.stringify({ event: "turnstile_secret_missing" }));
    return false;
  }

  if (!token || typeof token !== "string") {
    return false;
  }

  const body = new URLSearchParams();
  body.set("secret", secretKey);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch(VERIFY_URL, { method: "POST", body });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "turnstile_http_error", status: response.status }));
      return false;
    }
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error(JSON.stringify({ event: "turnstile_verify_exception", message: String(error) }));
    return false;
  }
}
