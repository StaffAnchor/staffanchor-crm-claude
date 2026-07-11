import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const STAGE_LABELS: Record<string, { label: string; tint: string }> = {
  sourced: { label: "Sourced", tint: "bg-slate-100 text-slate-600" },
  screened: { label: "Screened", tint: "bg-sky-50 text-sky-700" },
  shortlisted: { label: "Shortlisted", tint: "bg-indigo-50 text-indigo-700" },
  submitted: { label: "Submitted to client", tint: "bg-indigo-50 text-indigo-700" },
  client_interview: { label: "Client interview", tint: "bg-amber-50 text-amber-700" },
  offer: { label: "Offer", tint: "bg-emerald-50 text-emerald-700" },
  placed: { label: "Placed", tint: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Not moving forward", tint: "bg-rose-50 text-rose-700" },
};

type VendorSubmission = {
  cml_id: string;
  candidate_id: string;
  candidate_name: string;
  mandate_id: string;
  role_title: string;
  client_display: string;
  stage: string;
  in_shortlist: boolean;
  shortlisted_at: string | null;
  confirmed_interview_at: string | null;
  submitted_at: string;
};

export default async function VendorSubmissionsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_vendor_submissions");
  const submissions: VendorSubmission[] = (error ? [] : data ?? []) as VendorSubmission[];

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-[20px] font-semibold text-slate-900">My Submissions</h1>
      <p className="text-[13px] text-slate-500 mt-0.5 mb-5">
        {submissions.length === 0
          ? "You haven't submitted any candidates yet."
          : `${submissions.length} candidate${submissions.length === 1 ? "" : "s"} submitted by you, across all your mandates`}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load your submissions: {error.message}
        </div>
      )}

      {submissions.length === 0 && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">
            Head to a mandate under My Mandates to submit your first candidate.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {submissions.map((s) => {
            const stageMeta = STAGE_LABELS[s.stage] ?? { label: s.stage, tint: "bg-slate-100 text-slate-600" };
            return (
              <div
                key={s.cml_id}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-slate-900 truncate">{s.candidate_name}</p>
                  <Link
                    href={`/vendor/mandates/${s.mandate_id}`}
                    className="text-[12px] text-slate-500 hover:text-teal-600 truncate block"
                  >
                    {s.role_title} · {s.client_display}
                  </Link>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1 ${stageMeta.tint}`}>
                  {stageMeta.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
