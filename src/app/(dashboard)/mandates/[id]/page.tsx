import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShortlistLinkPanel from "./shortlist-link-panel";
import AlignCandidatesPanel from "./align-candidates-panel";
import PublicListingPanel from "./public-listing-panel";

const STAGE_COLOR: Record<string, string> = {
  sourced: "bg-slate-100 text-slate-700",
  screened: "bg-blue-100 text-blue-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

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
        <div className="bg-white border border-slate-200 rounded-xl p-6 mt-2 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">{mandate.role_title}</h1>
          <p className="text-sm text-slate-500">
            {mandate.client_name} · {mandate.city ?? "—"} ·{" "}
            {mandate.category?.replace("_", " ")} / {mandate.sub_domain}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mt-6 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Candidate</th>
                <th className="text-left px-4 py-2.5">Fixed CTC</th>
                <th className="text-left px-4 py-2.5">Recommendation</th>
                <th className="text-left px-4 py-2.5">Stage</th>
                <th className="text-left px-4 py-2.5">In client shortlist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(links ?? []).map((l) => {
                const cand = l.candidates as unknown as {
                  id: string;
                  full_name: string;
                  category: string | null;
                  sub_domain: string | null;
                  total_experience_years: number | null;
                  current_fixed_ctc: number | null;
                  recruiter_assessment: Record<string, unknown> | null;
                } | null;
                if (!cand) return null;
                return (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/candidates/${cand.id}`} className="font-medium text-slate-900 hover:text-blue-600">
                        {cand.full_name}
                      </Link>
                      <div className="text-xs text-slate-400">{cand.sub_domain}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {cand.current_fixed_ctc ? `₹${cand.current_fixed_ctc}L` : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {(cand.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_COLOR[l.stage] ?? "bg-slate-100 text-slate-700"}`}>
                        {l.stage.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.in_shortlist ? "Yes" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(links ?? []).length === 0 && (
            <p className="text-sm text-slate-500 text-center py-10">
              No candidates linked yet. Link candidates from their profile page.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <PublicListingPanel
          mandateId={id}
          initialShowClientName={mandate.show_client_name ?? true}
          initialPublicClientLabel={mandate.public_client_label}
          clientName={mandate.client_name}
        />
        <AlignCandidatesPanel mandateId={id} availableCandidates={availableCandidates} />
        <ShortlistLinkPanel mandateId={id} existingToken={existingToken?.token ?? null} />
      </div>
    </div>
  );
}
