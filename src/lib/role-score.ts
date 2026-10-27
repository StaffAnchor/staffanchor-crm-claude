import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleCard } from "@/lib/role-card";
import { rankCandidates, type MatchRow } from "@/lib/role-match";

// Scores people already on a mandate's pipeline (applicants, vendor submissions, anyone added) with the same ranking
// that finds new people, so everyone is judged one way: Perfect, Close or Stretch, with the reasons. The score and
// reasons are saved on the pipeline link. Needs the mandate's role type, level and role card; without them it does
// nothing and the caller keeps the older score.
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

  let scored = 0;
  for (const r of ranked) {
    const score = Math.max(0, Math.min(100, Math.round(r.score)));
    const unknown = r.gaps.filter((g) => /not known yet|Level not clear/.test(g));
    const hard = r.gaps.filter((g) => !unknown.includes(g));
    const recommendation = r.bucket === "perfect" ? "Strong Fit" : r.bucket === "close" || score >= 50 ? "Fit with Reservations" : "Not a Fit";
    const { error } = await admin
      .from("candidate_mandate_links")
      .update({
        match_score: score,
        match_score_breakdown: { source: "role_card", bucket: r.bucket, matched: r.matched, gaps: r.gaps },
        match_source: "role_card",
        matched_at: new Date().toISOString(),
        match_assessment: { recommendation, positives: r.matched, red_flags: hard, missing: unknown.map((g) => `${g} (confirm on call)`) },
      })
      .eq("mandate_id", mandateId)
      .eq("candidate_id", r.row.candidate_id);
    if (!error) scored++;
  }
  return { ok: true, scored };
}
