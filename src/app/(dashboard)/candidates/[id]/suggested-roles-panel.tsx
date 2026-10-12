import { createClient } from "@/lib/supabase/server";
import SuggestedRolesList, { type RoleSuggestion } from "./suggested-roles-list";

// The reverse of a role's "AI suggestions": the open roles this person looks right for, with the evidence.
export default async function SuggestedRolesPanel({ candidateId, hasCv }: { candidateId: string; hasCv: boolean }) {
  const supabase = await createClient();
  const [{ data: rows }, { data: links }, { count: openCount }] = await Promise.all([
    supabase
      .from("mandate_ai_matches")
      .select("mandate_id, fit, score, summary, checks, status, computed_at, mandates(id, role_title, city, cities, status, client_name)")
      .eq("candidate_id", candidateId)
      .eq("status", "suggested"),
    supabase.from("candidate_mandate_links").select("mandate_id").eq("candidate_id", candidateId),
    supabase.from("mandates").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const inPipeline = new Set(((links ?? []) as { mandate_id: string }[]).map((l) => l.mandate_id));
  type Row = {
    mandate_id: string;
    fit: "strong" | "possible" | "weak";
    score: number;
    summary: string | null;
    checks: RoleSuggestion["checks"];
    mandates: { id: string; role_title: string; city: string | null; cities: string[] | null; status: string; client_name: string | null } | { id: string; role_title: string; city: string | null; cities: string[] | null; status: string; client_name: string | null }[] | null;
  };
  const items: RoleSuggestion[] = ((rows ?? []) as unknown as Row[])
    .map((r) => {
      const m = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
      return m && m.status === "open" && !inPipeline.has(r.mandate_id)
        ? {
            mandateId: r.mandate_id,
            roleTitle: m.role_title,
            clientName: m.client_name,
            where: [...(m.cities ?? []), ...(m.city && !(m.cities ?? []).includes(m.city) ? [m.city] : [])].filter(Boolean).slice(0, 3).join(", "),
            fit: r.fit,
            score: r.score,
            summary: r.summary,
            checks: r.checks,
          }
        : null;
    })
    .filter((x): x is RoleSuggestion => x !== null)
    .sort((a, b) => ({ strong: 0, possible: 1, weak: 2 })[a.fit] - ({ strong: 0, possible: 1, weak: 2 })[b.fit] || b.score - a.score);

  return <SuggestedRolesList candidateId={candidateId} items={items} openRoles={openCount ?? 0} hasCv={hasCv} />;
}
