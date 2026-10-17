import { after } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { scoreLinksByRoleCard } from "@/lib/role-score";
import RoleCardAuto from "./role-card-auto";
import RoleTypeGate from "./role-type-gate";
import RoleCardEditor from "./role-card-editor";
import RankedGroups from "./ranked-groups";
import AlsoTypesBar from "./also-types-bar";
import ReferralAskPanel from "../../candidates/referrals/referral-ask-panel";
import type { RoleCard } from "@/lib/role-card";
import { clustersFor, rankCandidates, type MatchRow } from "@/lib/role-match";

// The best people in the whole database for this role, found and ranked automatically: write the role card from the
// mandate, then rank everyone against it, in three groups with the reasons shown.
export default async function BestMatchesPanel({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();
  // The mandate must say what kind of role this is and at what level. Nothing here guesses it.
  const { data: mandateRow } = await supabase.from("mandates").select("role_title, role_cluster, seniority_band, also_clusters, short_code, status, is_archived, listing_kind").eq("id", mandateId).maybeSingle();
  if (!mandateRow?.role_cluster || !mandateRow?.seniority_band) {
    return <RoleTypeGate mandateId={mandateId} roleTitle={mandateRow?.role_title ?? null} cluster={mandateRow?.role_cluster ?? null} level={mandateRow?.seniority_band ?? null} />;
  }
  const { data: cardRow } = await supabase.from("mandate_role_cards").select("card, confirmed").eq("mandate_id", mandateId).maybeSingle();
  if (!cardRow) return <RoleCardAuto mandateId={mandateId} />;
  const card = cardRow.card as RoleCard;
  const also = ((mandateRow.also_clusters as string[] | null) ?? []).filter((c) => c !== mandateRow.role_cluster);

  const [{ data: clusterRows }, { data: worldRows }, { data: edgeRows }, { data: linkRows }, { data: dismissedRows }, { data: outreachRows }] = await Promise.all([
    supabase.from("role_clusters").select("slug, name").order("sort_order"),
    supabase.from("selling_worlds").select("slug, name").order("sort_order"),
    supabase.from("selling_world_edges").select("a, b, weight"),
    supabase.from("candidate_mandate_links").select("candidate_id, match_source").eq("mandate_id", mandateId),
    supabase.from("match_dismissals").select("candidate_id").eq("mandate_id", mandateId),
    supabase.from("mandate_outreach").select("candidate_id, status, sent_at").eq("mandate_id", mandateId),
  ]);
  const clusters = (clusterRows ?? []) as { slug: string; name: string }[];
  const worlds = (worldRows ?? []) as { slug: string; name: string }[];
  const edges = new Map<string, Map<string, number>>();
  for (const e of (edgeRows ?? []) as { a: string; b: string; weight: number }[]) {
    (edges.get(e.a) ?? edges.set(e.a, new Map()).get(e.a)!).set(e.b, Number(e.weight));
    (edges.get(e.b) ?? edges.set(e.b, new Map()).get(e.b)!).set(e.a, Number(e.weight));
  }

  // Worlds worth fetching: the ideal ones, the accepted ones, and anything close to an ideal one.
  const want = new Set<string>([...card.exact_worlds, ...card.adjacent_worlds.map((a) => a.slug)]);
  for (const ex of card.exact_worlds) for (const [w, v] of edges.get(ex) ?? []) if (v >= 0.5) want.add(w);

  const { data: rows } = await supabase.rpc("role_match_candidates", { p_clusters: clustersFor(card, also), p_worlds: Array.from(want), p_limit: 900 });
  const links = (linkRows ?? []) as { candidate_id: string; match_source: string | null }[];
  const inPipeline = new Set(links.map((l) => l.candidate_id));
  // People already on the pipeline (applicants included) get scored by this same ranking, once, in the background.
  const toScore = links.filter((l) => l.match_source !== "role_card").map((l) => l.candidate_id);
  if (toScore.length > 0) {
    after(async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      await scoreLinksByRoleCard(createServiceClient(url, key, { auth: { persistSession: false } }), mandateId, toScore).catch(() => {});
    });
  }
  const dismissed = new Set(((dismissedRows ?? []) as { candidate_id: string }[]).map((d) => d.candidate_id));
  const pool = ((rows ?? []) as MatchRow[]).filter((r) => !inPipeline.has(r.candidate_id) && !dismissed.has(r.candidate_id));
  const nameOf = new Map(worlds.map((w) => [w.slug, w.name]));
  const ranked = rankCandidates(card, pool, edges, (s) => nameOf.get(s) ?? s, { also });

  return (
    <div className="space-y-4">
      <RoleCardEditor key={JSON.stringify(card)} mandateId={mandateId} card={card} confirmed={!!cardRow.confirmed} clusters={clusters} worlds={worlds} />
      <AlsoTypesBar mandateId={mandateId} main={mandateRow.role_cluster} initial={also} />
      {mandateRow.status === "open" && !mandateRow.is_archived && mandateRow.listing_kind !== "pipeline" && mandateRow.short_code && (
        <ReferralAskPanel
          endpoint={`/api/mandates/${mandateId}/referral-ask`}
          heading="Ask for referrals for this role"
          blurb="People most likely to know a fit: the same kind of job, the same city, people we placed, and people rated top or strong. They see this role and refer someone; the referral is saved against it. Nobody is asked twice about the same role."
          templateKey="referralRole"
        />
      )}
      <RankedGroups mandateId={mandateId} ranked={ranked.slice(0, 120)} reached={Object.fromEntries(((outreachRows ?? []) as { candidate_id: string; status: string; sent_at: string }[]).map((o) => [o.candidate_id, { status: o.status, at: o.sent_at }]))} />
      <p className="text-[12px] text-slate-400">
        Ranked from {pool.length} people in your database whose job or world is close to this role. Anyone already in this pipeline, or marked not a fit, is left out.
      </p>
    </div>
  );
}
