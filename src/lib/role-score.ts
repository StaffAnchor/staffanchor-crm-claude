import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleCard } from "@/lib/role-card";
import { rankCandidates, type MatchRow } from "@/lib/role-match";

// Scores people already on a mandate's pipeline (applicants, vendor submissions, anyone added) with the same ranking
// that finds new people, so everyone is judged one way: Perfect, Close or Stretch, with the reasons. The score and
// reasons are saved on the pipeline link. Needs the mandate's role type, level and role card; without them it does
// nothing and the caller keeps the older score.
/** Bump when the scoring rules change; the Matches tab then re-scores older pipeline scores once. 2: Delhi, New Delhi, Noida, Gurgaon and the rest count as Delhi NCR. 3: verdict needs a named knockout for Not a Fit, unknown facts read as Needs a call, more experience than asked is a soft check, job title fills in a missing function. */
export const ROLE_SCORE_VERSION = 3;

export async function scoreLinksByRoleCard(admin: SupabaseClient, mandateId: string, candidateIds: string[]): Promise<{ ok: boolean; scored: number; reason?: string }> {
  if (candidateIds.length === 0) return { ok: true, scored: 0 };
  const { data: mandate } = await admin.from("mandates").select("role_cluster, seniority_band, also_clusters").eq("id", mandateId).maybeSingle();
  if (!mandate?.role_cluster || !mandate?.seniority_band) return { ok: false, scored: 0, reason: "no role type or level" };
  const { data: cardRow } = await admin.from("mandate_role_cards").select("card").eq("mandate_id", mandateId).maybeSingle();
  if (!cardRow) return { ok: false, scored: 0, reason: "no role card" };
  const card = cardRow.card as RoleCard;

  const [{ data: worldRows }, { data: edgeRows }, { data: rows }] = await Promise.all([
    admin.from("selling_worlds").select("slug, name"),
    admin.from("selling_world_edges").select("a, b, weight"),
    admin.rpc("role_match_rows", { p_ids: candidateIds }),
  ]);
  const edges = new Map<string, Map<string, number>>();
  for (const e of (edgeRows ?? []) as { a: string; b: string; weight: number }[]) {
    (edges.get(e.a) ?? edges.set(e.a, new Map()).get(e.a)!).set(e.b, Number(e.weight));
    (edges.get(e.b) ?? edges.set(e.b, new Map()).get(e.b)!).set(e.a, Number(e.weight));
  }
  const nameOf = new Map(((worldRows ?? []) as { slug: string; name: string }[]).map((w) => [w.slug, w.name]));
  const ranked = rankCandidates(card, (rows ?? []) as MatchRow[], edges, (x) => nameOf.get(x) ?? x, { keepAll: true, also: (mandate.also_clusters as string[] | null) ?? [] });

  // Anyone with a call on record has had the unknowns put to them, so a gap in the CV alone no longer means "needs a call".
  const { data: callRows } = await admin.from("call_log").select("candidate_id").in("candidate_id", candidateIds).eq("outcome", "reached");
  const called = new Set(((callRows ?? []) as { candidate_id: string }[]).map((c) => c.candidate_id));

  let scored = 0;
  for (const r of ranked) {
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    const isUnknown = (g: string) => /not known yet|Level not clear|not clear yet|not asked|City not clear/i.test(g);
    const hard = r.gaps.filter((g) => !isUnknown(g));
    // Not a Fit needs a named reason (or two real gaps). Unknowns never count against anyone: they say "needs a call".
    const enoughUnknown = r.unknown.length >= 3 || (r.unknown.length >= 2 && !called.has(r.row.candidate_id));
    const recommendation =
      r.knockouts.length > 0 || r.misses >= 2
        ? "Not a Fit"
        : enoughUnknown
          ? "Needs a call"
          : r.bucket === "perfect" && r.unknown.length <= 1
            ? "Strong Fit"
            : "Fit with Reservations";
    const redFlags = recommendation === "Not a Fit" ? Array.from(new Set([...r.knockouts, ...hard])) : hard;
    const { error } = await admin
      .from("candidate_mandate_links")
      .update({
        // A number would suggest we know; with this much missing we do not, so the score stays empty until a call fills it in.
        match_score: recommendation === "Needs a call" ? null : score,
        match_score_breakdown: { source: "role_card", ver: ROLE_SCORE_VERSION, bucket: r.bucket, matched: r.matched, gaps: r.gaps, knockouts: r.knockouts, unknown: r.unknown },
        match_source: "role_card",
        matched_at: new Date().toISOString(),
        match_assessment: { recommendation, positives: r.matched, red_flags: redFlags, missing: r.unknown.map((g) => `${g} (confirm on call)`) },
      })
      .eq("mandate_id", mandateId)
      .eq("candidate_id", r.row.candidate_id);
    if (!error) scored++;
  }
  return { ok: true, scored };
}
