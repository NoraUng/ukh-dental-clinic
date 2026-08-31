// Small Web Crypto helpers. Deno's runtime exposes the standard
// `crypto.subtle` API, so no external dependency is needed.

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Plain SHA-256 hex digest of a UTF-8 string. */
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Salted HMAC-SHA256 hex digest, used for hashing IP addresses so the raw
 * IP is never stored — only a keyed hash of it, which is useless without
 * the server-side secret and cannot be reversed back to the IP.
 */
export async function hmacSha256Hex(text, secret) {
  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return toHex(signature);
}

// Crockford-style alphabet with ambiguous characters (0/O, 1/I/L) removed,
// so a reference number read aloud over the phone is unambiguous.
const REFERENCE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A random, non-sequential, human-friendly reference number like UKH-7K3M9QXP. */
export function generateReferenceNumber() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const byte of bytes) {
    suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  }
  return `UKH-${suffix}`;
}
