import crypto from "crypto";

// Signs/verifies the httpOnly cookie that proves a client contact has
// already completed the email-code verification for one specific shortlist
// link. Deliberately does not introduce a new env var -- HMACs with
// SUPABASE_SERVICE_ROLE_KEY (already required for this route family, e.g.
// resume signed URLs) namespaced with a fixed prefix, so there's nothing new
// to configure in Vercel for this to work.
const SECRET = `shortlist-auth:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days -- long enough that a
// client contact who verified once doesn't have to re-enter a code every
// time they revisit the link over the life of a mandate, short enough that
// a leaked cookie value doesn't grant indefinite access.

export function cookieNameFor(token: string): string {
  return `sl_auth_${token}`;
}

export function signShortlistCookie(token: string, email: string): { value: string; maxAge: number } {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${token}:${email.toLowerCase()}:${expires}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  const value = `${Buffer.from(payload).toString("base64url")}.${hmac}`;
  return { value, maxAge: MAX_AGE_SECONDS };
}

// Returns the verified email if the cookie is valid for this exact token
// and not expired/tampered, otherwise null.
export function verifyShortlistCookie(cookieValue: string | undefined, token: string): string | null {
  if (!cookieValue) return null;
  const [encodedPayload, hmac] = cookieValue.split(".");
  if (!encodedPayload || !hmac) return null;
  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedHmac = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  // Constant-time comparison -- this is an auth check, not worth a timing
  // side-channel over a string-length mismatch.
  const a = Buffer.from(hmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [payloadToken, email, expiresStr] = payload.split(":");
  if (payloadToken !== token) return null;
  const expires = Number(expiresStr);
  if (!expires || Date.now() > expires) return null;
  return email;
}

export function generateSixDigitCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
