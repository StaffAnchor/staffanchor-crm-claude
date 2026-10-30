import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoleCard } from "@/lib/role-card";
import { clustersFor, rankCandidates, type MatchRow } from "@/lib/role-match";

// For roles marked urgent: the people who match the role best (Perfect, then Close), in order, so Calls today can put the
// ones who still lack details first. The ranking is the same one the role's Matches tab uses.

export type UrgentRole = { id: string; title: string; client: string | null };
export type UrgentMatch = { candidateId: string; roleId: string; roleTitle: string; bucket: "perfect" | "close"; score: number; order: number };

const PER_ROLE = 80;
const MAX_ROLES = 3;

export async function loadUrgentRoleMatches(supabase: SupabaseClient): Promise<{ roles: UrgentRole[]; matches: UrgentMatch[] }> {
  const { data: mandates } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, role_cluster, also_clusters")
    .eq("is_urgent", true)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(MAX_ROLES);
  const rows = (mandates ?? []) as { id: string; role_title: string | null; client_name: string | null; role_cluster: string | null; also_clusters: string[] | null }[];
  if (rows.length === 0) return { roles: [], matches: [] };

  const [{ data: edgeRows }, { data: worldRows }] = await Promise.all([supabase.from("selling_world_edges").select("a, b, weight"), supabase.from("selling_worlds").select("slug, name")]);
  const edges = new Map<string, Map<string, number>>();
  for (const e of (edgeRows ?? []) as { a: string; b: string; weight: number }[]) {
    (edges.get(e.a) ?? edges.set(e.a, new Map()).get(e.a)!).set(e.b, Number(e.weight));
    (edges.get(e.b) ?? edges.set(e.b, new Map()).get(e.b)!).set(e.a, Number(e.weight));
  }
  const nameOf = new Map(((worldRows ?? []) as { slug: string; name: string }[]).map((w) => [w.slug, w.name]));

  const roles: UrgentRole[] = [];
  const matches: UrgentMatch[] = [];
  for (const m of rows) {
    roles.push({ id: m.id, title: m.role_title ?? "Role", client: m.client_name });
    const { data: cardRow } = await supabase.from("mandate_role_cards").select("card").eq("mandate_id", m.id).maybeSingle();
    if (!cardRow || !m.role_cluster) continue;
    const card = cardRow.card as RoleCard;
    const also = (m.also_clusters ?? []).filter((c) => c !== m.role_cluster);
    const want = new Set<string>([...card.exact_worlds, ...card.adjacent_worlds.map((a) => a.slug)]);
    for (const ex of card.exact_worlds) for (const [w, v] of edges.get(ex) ?? []) if (v >= 0.5) want.add(w);
    const [{ data: pool }, { data: dismissed }] = await Promise.all([
      supabase.rpc("role_match_candidates", { p_clusters: clustersFor(card, also), p_worlds: Array.from(want), p_limit: 900 }),
      supabase.from("match_dismissals").select("candidate_id").eq("mandate_id", m.id),
    ]);
    const skip = new Set(((dismissed ?? []) as { candidate_id: string }[]).map((d) => d.candidate_id));
    const ranked = rankCandidates(card, ((pool ?? []) as MatchRow[]).filter((r) => !skip.has(r.candidate_id)), edges, (s) => nameOf.get(s) ?? s, { also })
      .filter((r) => r.bucket === "perfect" || r.bucket === "close")
      .slice(0, PER_ROLE);
    ranked.forEach((r, i) => matches.push({ candidateId: r.row.candidate_id, roleId: m.id, roleTitle: m.role_title ?? "Role", bucket: r.bucket as "perfect" | "close", score: r.score, order: i }));
  }
  return { roles, matches };
}
