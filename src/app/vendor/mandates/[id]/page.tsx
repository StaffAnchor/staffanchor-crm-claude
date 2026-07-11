import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft, MapPin } from "lucide-react";
import SubmitCandidateForm from "./submit-candidate-form";
import type { VendorMandate } from "../page";

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

export default async function VendorMandateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: mandates, error: mandatesError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase.rpc("get_my_vendor_mandates"),
    supabase.rpc("get_my_vendor_submissions"),
  ]);

  const mandate = ((mandates ?? []) as VendorMandate[]).find((m) => m.mandate_id === id);
  if (!mandatesError && !mandate) notFound();

  const mySubmissions = ((submissions ?? []) as VendorSubmission[]).filter((s) => s.mandate_id === id);

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <Link href="/vendor/mandates" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> My Mandates
      </Link>

      {mandatesError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load this mandate: {mandatesError.message}
        </div>
      )}

      {mandate && (
        <>
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h1 className="text-[20px] font-semibold text-slate-900">{mandate.role_title}</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">{mandate.client_display}</p>
            </div>
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-teal-600 bg-teal-50 ring-1 ring-teal-200 rounded-full px-2.5 py-1">
              {mandate.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500 mb-6">
            {mandate.cities && mandate.cities.length > 0 && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {mandate.cities.join(", ")}
              </span>
            )}
            {(mandate.experience_min || mandate.experience_max) && (
              <span>
                {mandate.experience_min ?? 0}-{mandate.experience_max ?? "+"} yrs experience
              </span>
            )}
            {mandate.sub_domain && <span>{mandate.sub_domain}</span>}
          </div>

          <div className="mb-6">
            <SubmitCandidateForm mandateId={mandate.mandate_id} />
          </div>
        </>
      )}

      <h2 className="text-[15px] font-semibold text-slate-900 mb-3">Your submissions for this mandate</h2>

      {submissionsError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load your submissions: {submissionsError.message}
        </div>
      )}

      {mySubmissions.length === 0 && !submissionsError ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 flex items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">No candidates submitted for this mandate yet.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {mySubmissions.map((s) => {
            const stageMeta = STAGE_LABELS[s.stage] ?? { label: s.stage, tint: "bg-slate-100 text-slate-600" };
            return (
              <div
                key={s.cml_id}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0"
              >
                <span className="text-[13px] font-medium text-slate-900">{s.candidate_name}</span>
                <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${stageMeta.tint}`}>
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
