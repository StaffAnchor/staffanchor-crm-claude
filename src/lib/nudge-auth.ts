import crypto from "crypto";

// Stateless one-click unsubscribe link for the automated profile-nudge cron
// (src/app/api/cron/profile-nudge-sweep). Same precedent as shortlist-auth.ts:
// HMAC over SUPABASE_SERVICE_ROLE_KEY namespaced with a fixed prefix, rather
// than introducing a new env var or a DB-stored token table for something
// this low-stakes (worst case of a forged/guessed token is one candidate
// stops getting reminder emails).
const SECRET = `nudge-unsub:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;

export function signUnsubscribeToken(candidateId: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(candidateId).digest("hex");
  return `${Buffer.from(candidateId).toString("base64url")}.${hmac}`;
}

// Returns the candidateId if the token is valid, otherwise null. No
// expiry -- an unsubscribe link should keep working for as long as the
// candidate might receive nudges, which is exactly the case where they'd
// want to click it.
export function verifyUnsubscribeToken(token: string | null): string | null {
  if (!token) return null;
  const [encodedId, hmac] = token.split(".");
  if (!encodedId || !hmac) return null;
  let candidateId: string;
  try {
    candidateId = Buffer.from(encodedId, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedHmac = crypto.createHmac("sha256", SECRET).update(candidateId).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(expectedHmac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return candidateId;
}
