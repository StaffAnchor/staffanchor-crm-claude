import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShortlistLinkPanel from "./shortlist-link-panel";
import AlignCandidatesPanel from "./align-candidates-panel";
import PublicListingPanel from "./public-listing-panel";
import JobDescriptionPanel from "./job-description-panel";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import DeleteMandateButton from "./delete-mandate-button";

export default async function MandateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: mandate } = await supabase.from("mandates").select("*").eq("id", id).single();
  if (!mandate) notFound();

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("id, stage, in_shortlist, candidates(id, full_name, category, sub_domain, total_experience_years, current_fixed_ctc, recruiter_assessment)")
    .eq("mandate_id", id);

  const { data: existingToken } = await supabase
    .from("shortlist_tokens")
    .select("token")
    .eq("mandate_id", id)
    .maybeSingle();

  const linkedCandidateIds = new Set((links ?? []).map((l) => (l.candidates as unknown as { id: string } | null)?.id).filter(Boolean));
  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("id, full_name, category, sub_domain, current_employer")
    .order("created_at", { ascending: false })
    .limit(500);
  const availableCandidates = (allCandidates ?? []).filter((c) => !linkedCandidateIds.has(c.id));

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <Link href="/mandates" className="text-xs text-slate-500 hover:text-slate-800">
          ← All mandates
        </Link>
        <div className="bg-white border border-slate-200 rounded-xl p-6 mt-2 shadow-sm flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{mandate.role_title}</h1>
            <p className="text-sm text-slate-500">
              {mandate.client_name} · {mandate.city ?? "—"} ·{" "}
              {mandate.category?.replace("_", " ")} / {mandate.sub_domain}
            </p>
          </div>
          <DeleteMandateButton mandateId={id} roleTitle={mandate.role_title} />
        </div>

        <MandateCandidatesTable
          rows={(links ?? [])
            .map((l) => {
              const cand = l.candidates as unknown as MandateCandidateRow["candidate"] | null;
              if (!cand) return null;
              return { id: l.id, stage: l.stage, in_shortlist: l.in_shortlist, candidate: cand };
            })
            .filter((r): r is MandateCandidateRow => r !== null)}
        />
      </div>

      <div className="space-y-6">
        <PublicListingPanel
          mandateId={id}
          initialShowClientName={mandate.show_client_name ?? true}
          initialPublicClientLabel={mandate.public_client_label}
          clientName={mandate.client_name}
        />
        <JobDescriptionPanel mandateId={id} initialDescription={mandate.job_description} />
        <AlignCandidatesPanel mandateId={id} availableCandidates={availableCandidates} />
        <ShortlistLinkPanel mandateId={id} existingToken={existingToken?.token ?? null} />
        {mandate.client_id && (
          <Link
            href={`/clients/${mandate.client_id}`}
            className="block bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-sm text-slate-700"
          >
            <span className="font-medium text-blue-600">Manage {mandate.client_name} →</span>
            <p className="text-xs text-slate-500 mt-0.5">
              Client details, contacts, and portal access are managed once per client, not per mandate.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
