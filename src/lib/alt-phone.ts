import type { SupabaseClient } from "@supabase/supabase-js";

const key10 = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

/**
 * Remember another number for the same person, so the next message from it is recognised.
 * Does nothing if it is already their main or an alternate number. Returns whether it was added.
 */
export async function addAlternatePhone(admin: SupabaseClient, candidateId: string, rawPhone: string): Promise<boolean> {
  const k = key10(rawPhone);
  if (!k) return false;
  const { data: cur } = await admin.from("candidates").select("phone, alt_phones").eq("id", candidateId).maybeSingle();
  if (!cur) return false;
  if (key10(cur.phone as string | null) === k) return false;
  const alts = ((cur.alt_phones as string[] | null) ?? []).filter(Boolean);
  if (alts.some((a) => key10(a) === k)) return false;
  const { error } = await admin.from("candidates").update({ alt_phones: [...alts, k], updated_at: new Date().toISOString() }).eq("id", candidateId);
  return !error;
}
