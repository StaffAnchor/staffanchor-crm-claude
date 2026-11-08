import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ranked } from "@/lib/role-match";

// What a candidate said about one specific role on a call (saved by "Read a call"). A "not interested" keeps them out of that
// role's matches and calls; a "yes" lifts them and says why; a "maybe" is noted. Nothing here changes a profile.
export type RoleInterest = { interest: "interested" | "maybe" | "not_interested"; reason: string | null };

/** Everyone who has said something about this role. */
export async function interestForRole(supabase: SupabaseClient, mandateId: string): Promise<Map<string, RoleInterest>> {
  const { data } = await supabase.from("candidate_role_interest").select("candidate_id, interest, reason").eq("mandate_id", mandateId);
  return new Map(((data ?? []) as { candidate_id: string; interest: RoleInterest["interest"]; reason: string | null }[]).map((r) => [r.candidate_id, { interest: r.interest, reason: r.reason }]));
}

/** Drops people who said no to the role, lifts people who said yes, and notes the maybes. The order of the rest is kept. */
export function applyRoleInterest(ranked: Ranked[], interest: Map<string, RoleInterest>): Ranked[] {
  if (interest.size === 0) return ranked;
  const out: Ranked[] = [];
  for (const r of ranked) {
    const i = interest.get(r.row.candidate_id);
    if (!i) {
      out.push(r);
      continue;
    }
    if (i.interest === "not_interested") continue;
    const note = i.reason ? `: ${i.reason}` : "";
    if (i.interest === "interested") out.push({ ...r, score: Math.min(100, r.score + 15), matched: [`Said yes to this role on a call${note}`, ...r.matched] });
    else out.push({ ...r, matched: [`Maybe on a call${note}`, ...r.matched] });
  }
  return out;
}
