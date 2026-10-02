import { createClient } from "@/lib/supabase/server";
import { specHashOf, cleanList, type MatchChecks, type RoleForMatch } from "@/lib/ai-match";
import AiMatchesList, { type MatchItem } from "./ai-matches-list";

// The role's own space for AI-found candidates: people from the whole bank
// (including old applicants and freshly read CVs) checked against this role's
// must-haves and good-to-haves, with evidence and the doubts to confirm.
export default async function AiMatchesPanel({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();

  const [{ data: role }, { data: rows }, { count: read }, { count: withCv }] = await Promise.all([
    supabase
      .from("mandates")
      .select("id, role_title, status, must_haves, good_to_haves, experience_min, experience_max, cities, city, ai_match_last_run_at")
      .eq("id", mandateId)
      .single(),
    supabase
      .from("mandate_ai_matches")
      .select("candidate_id, fit, score, summary, checks, spec_hash, status, computed_at, candidates(full_name, current_job_title, current_employer, total_experience_years, current_location)")
      .eq("mandate_id", mandateId)
      .neq("status", "dismissed")
      .order("score", { ascending: false })
      .limit(300),
    supabase.from("candidate_cv_facts").select("candidate_id", { count: "exact", head: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }).or("resume_file_url.not.is.null,resume_text.not.is.null"),
  ]);

  const r = role as (RoleForMatch & { ai_match_last_run_at: string | null }) | null;
  if (!r) return null;
  const currentSpec = specHashOf(r);

  type Row = {
    candidate_id: string;
    fit: "strong" | "possible" | "weak";
    score: number;
    summary: string | null;
    checks: MatchChecks;
    spec_hash: string;
    status: "suggested" | "added";
    computed_at: string;
    candidates: { full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | null; current_location: string | null } | { full_name: string | null; current_job_title: string | null; current_employer: string | null; total_experience_years: number | null; current_location: string | null }[] | null;
  };

  const items: MatchItem[] = ((rows ?? []) as unknown as Row[]).map((m) => {
    const c = Array.isArray(m.candidates) ? m.candidates[0] : m.candidates;
    return {
      candidateId: m.candidate_id,
      name: c?.full_name ?? "Candidate",
      headline: [c?.current_job_title, c?.current_employer].filter(Boolean).join(" at "),
      years: c?.total_experience_years != null ? Number(c.total_experience_years) : null,
      location: c?.current_location ?? null,
      fit: m.fit,
      score: m.score,
      summary: m.summary,
      checks: m.checks,
      stale: m.spec_hash !== currentSpec,
      status: m.status,
    };
  });

  return (
    <AiMatchesList
      mandateId={mandateId}
      roleOpen={r.status === "open"}
      hasMustHaves={cleanList(r.must_haves).length > 0}
      lastRunAt={r.ai_match_last_run_at}
      cvsRead={read ?? 0}
      cvsTotal={withCv ?? 0}
      items={items}
    />
  );
}
