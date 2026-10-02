import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cleanList, normalizeCtc, specHashOf, type MatchChecks, type RoleForMatch } from "@/lib/ai-match";
import type { CvFacts } from "@/lib/cv-facts";
import TriageDeck, { type TriageItem } from "./triage-deck";

export const dynamic = "force-dynamic";

const QUEUE_LIMIT = 80;
const CHUNK = 80;

type CandidateRow = {
  full_name: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  total_experience_years: number | null;
  current_location: string | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  open_to_relocation: string | null;
  ai_summary: string | null;
  stability_score: number | null;
};

type LinkRow = {
  id: string;
  candidate_id: string;
  viewed_at: string | null;
  created_at: string;
  match_score: number | null;
  candidates: CandidateRow | CandidateRow[] | null;
};

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function salesChips(f: CvFacts | undefined): string[] {
  if (!f) return [];
  const s = f.sales;
  return [
    s.customer_type ? s.customer_type.toUpperCase() : null,
    ...s.segments,
    s.primary_motion,
    s.hunter_or_farmer !== "unclear" ? s.hunter_or_farmer : null,
    s.owned_full_cycle === "yes" ? "Owns full cycle" : null,
    s.leads_team ? (s.largest_team_size ? `Leads a team (up to ${s.largest_team_size})` : "Leads a team") : null,
  ].filter(Boolean) as string[];
}

const FIT_ORDER = { strong: 0, possible: 1, weak: 2 } as const;

type SortKey = { unseen: number; fit: number; score: number; created: string };
type Sortable = TriageItem & { _sort: SortKey };

// One-at-a-time review of the applicants nobody has looked at yet: the
// verdict and doubts for this role, what the CV shows, and three buttons.
export default async function TriagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: role } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, status, must_haves, good_to_haves, experience_min, experience_max, cities, city")
    .eq("id", id)
    .maybeSingle();
  if (!role) notFound();

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, candidate_id, viewed_at, created_at, match_score, candidates(full_name, current_job_title, current_employer, total_experience_years, current_location, current_fixed_ctc, expected_fixed_ctc, notice_period, open_to_relocation, ai_summary, stability_score)"
    )
    .eq("mandate_id", id)
    .eq("stage", "sourced")
    .order("created_at", { ascending: true })
    .limit(400);
  const rows = (links ?? []) as unknown as LinkRow[];
  const ids = rows.map((r) => r.candidate_id);

  const factsById = new Map<string, CvFacts>();
  const matchById = new Map<string, { fit: "strong" | "possible" | "weak"; score: number; summary: string | null; checks: MatchChecks; spec_hash: string }>();
  for (const part of chunks(ids, CHUNK)) {
    const [{ data: f }, { data: m }] = await Promise.all([
      supabase.from("candidate_cv_facts").select("candidate_id, facts").in("candidate_id", part),
      supabase.from("mandate_ai_matches").select("candidate_id, fit, score, summary, checks, spec_hash").eq("mandate_id", id).in("candidate_id", part),
    ]);
    for (const x of (f ?? []) as { candidate_id: string; facts: CvFacts }[]) factsById.set(x.candidate_id, x.facts);
    for (const x of (m ?? []) as { candidate_id: string; fit: "strong" | "possible" | "weak"; score: number; summary: string | null; checks: MatchChecks; spec_hash: string }[]) matchById.set(x.candidate_id, x);
  }

  const spec = specHashOf(role as unknown as RoleForMatch);

  const items: Sortable[] = rows.map((r) => {
    const c = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
    const facts = factsById.get(r.candidate_id);
    const m = matchById.get(r.candidate_id);
    return {
      linkId: r.id,
      candidateId: r.candidate_id,
      name: c?.full_name ?? "Candidate",
      headline: [c?.current_job_title, c?.current_employer].filter(Boolean).join(" at "),
      years: c?.total_experience_years != null ? Number(c.total_experience_years) : null,
      location: c?.current_location ?? null,
      currentCtc: normalizeCtc(c?.current_fixed_ctc),
      expectedCtc: normalizeCtc(c?.expected_fixed_ctc),
      notice: c?.notice_period ?? null,
      stability: c?.stability_score != null ? Number(c.stability_score) : null,
      summary: c?.ai_summary ? c.ai_summary.slice(0, 320) : null,
      unseen: !r.viewed_at,
      hasFacts: !!facts,
      salesChips: salesChips(facts),
      recentRoles: (facts?.roles ?? []).slice(0, 3).map((x) => [x.title, x.company].filter(Boolean).join(" at ") + (x.industry ? ` (${x.industry})` : "")),
      flags: (facts?.flags ?? []).slice(0, 3),
      check: m && m.spec_hash === spec ? { fit: m.fit, score: m.score, summary: m.summary, checks: m.checks } : null,
      _sort: { unseen: !r.viewed_at ? 0 : 1, fit: m && m.spec_hash === spec ? FIT_ORDER[m.fit] : 3, score: m?.score ?? r.match_score ?? 0, created: r.created_at },
    };
  });

  items.sort(
    (a, b) =>
      a._sort.unseen - b._sort.unseen ||
      a._sort.fit - b._sort.fit ||
      b._sort.score - a._sort.score ||
      a._sort.created.localeCompare(b._sort.created)
  );
  const queue = items.slice(0, QUEUE_LIMIT).map(({ _sort, ...rest }) => (void _sort, rest));

  return (
    <div className="max-w-[820px] mx-auto px-5 py-6">
      <Link href={`/mandates/${id}`} className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden /> Back to the role
      </Link>
      <TriageDeck
        mandateId={id}
        roleTitle={role.role_title ?? "Role"}
        clientName={role.client_name ?? ""}
        hasMustHaves={cleanList(role.must_haves).length > 0}
        items={queue}
        totalWaiting={items.length}
      />
    </div>
  );
}
