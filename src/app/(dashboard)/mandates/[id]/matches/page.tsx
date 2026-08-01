import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MatchesWorkspace from "./matches-workspace";

// Dedicated full-page matching workspace for one mandate -- separate from
// the compact "Find matching candidates" sidebar panel on the mandate
// detail page (find-matches-panel.tsx). That panel is still the fast path
// for a quick top-of-pipeline glance; this page is for when a recruiter
// wants to actually work the match: type in ad hoc extra criteria beyond
// the JD's stored must-haves (e.g. "Punjabi language is must, 5-9 years
// mandatory, B2C Sales mandatory" for a one-off search), see the full
// per-requirement met/not_met/unclear breakdown for every candidate, and
// sort by how many hard requirements are actually confirmed rather than
// just an overall score.
export default async function MandateMatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: mandate } = await supabase
    .from("mandates")
    .select(
      "id, role_title, client_name, category, sub_domain, city, experience_min, experience_max, budget_max, must_haves, good_to_haves, auto_match_results, auto_match_computed_at"
    )
    .eq("id", id)
    .single();
  if (!mandate) notFound();

  return (
    <div>
      <Link
        href={`/mandates/${id}`}
        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
      >
        ← Back to {mandate.role_title}
      </Link>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mt-2 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Matching workspace — {mandate.role_title}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {mandate.client_name} · {mandate.city ?? "—"} · {mandate.category?.replace("_", " ")} / {mandate.sub_domain}
          {mandate.experience_min != null && mandate.experience_max != null
            ? ` · ${mandate.experience_min}-${mandate.experience_max} yrs`
            : ""}
        </p>
      </div>

      <MatchesWorkspace
        mandateId={id}
        mustHaves={mandate.must_haves ?? []}
        goodToHaves={mandate.good_to_haves ?? []}
        initialMatches={mandate.auto_match_results ?? null}
        initialComputedAt={mandate.auto_match_computed_at ?? null}
      />
    </div>
  );
}
