import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleCard } from "@/lib/role-card";
import { rankCandidates, type MatchRow } from "@/lib/role-match";

export type RoleFit = { mandateId: string; roleTitle: string; clientName: string | null; bucket: "perfect" | "close" | "stretch"; score: number; why: string };

// The open roles one person fits best, by the same structured ranking the role's Matches use, so a profile never says
// "no match" just because the slower AI check has not reached them. Only roles with a role type, level and role card
// can be ranked; people already in a role's pipeline are left out.
export async function bestRoleFits(admin: SupabaseClient, candidateId: string, limit = 3): Promise<RoleFit[]> {
  const [{ data: mandates }, { data: links }, { data: cards }, { data: worldRows }, { data: edgeRows }, { data: rows }] = await Promise.all([
    admin.from("mandates").select("id, role_title, client_name, also_clusters").eq("status", "open").not("role_cluster", "is", null).not("seniority_band", "is", null),
    admin.from("candidate_mandate_links").select("mandate_id").eq("candidate_id", candidateId),
    admin.from("mandate_role_cards").select("mandate_id, card"),
    admin.from("selling_worlds").select("slug, name"),
    admin.from("selling_world_edges").select("a, b, weight"),
    admin.rpc("role_match_rows", { p_ids: [candidateId] }),
  ]);
  const row = ((rows ?? []) as MatchRow[])[0];
  if (!row) return [];
  const edges = new Map<string, Map<string, number>>();
  for (const e of (edgeRows ?? []) as { a: string; b: string; weight: number }[]) {
    (edges.get(e.a) ?? edges.set(e.a, new Map()).get(e.a)!).set(e.b, Number(e.weight));
    (edges.get(e.b) ?? edges.set(e.b, new Map()).get(e.b)!).set(e.a, Number(e.weight));
  }
  const nameOf = new Map(((worldRows ?? []) as { slug: string; name: string }[]).map((w) => [w.slug, w.name]));
  const cardOf = new Map(((cards ?? []) as { mandate_id: string; card: RoleCard }[]).map((c) => [c.mandate_id, c.card]));
  const inPipeline = new Set(((links ?? []) as { mandate_id: string }[]).map((l) => l.mandate_id));

  const out: RoleFit[] = [];
  for (const m of (mandates ?? []) as { id: string; role_title: string; client_name: string | null; also_clusters: string[] | null }[]) {
    const card = cardOf.get(m.id);
    if (!card || inPipeline.has(m.id)) continue;
    const r = rankCandidates(card, [row], edges, (s) => nameOf.get(s) ?? s, { keepAll: true, also: m.also_clusters ?? [] })[0];
    if (!r) continue;
    out.push({ mandateId: m.id, roleTitle: m.role_title, clientName: m.client_name, bucket: r.bucket, score: Math.round(r.score), why: r.matched[0] ?? r.gaps[0] ?? "" });
  }
  const order = { perfect: 0, close: 1, stretch: 2 };
  return out.sort((a, b) => order[a.bucket] - order[b.bucket] || b.score - a.score).slice(0, limit);
}
