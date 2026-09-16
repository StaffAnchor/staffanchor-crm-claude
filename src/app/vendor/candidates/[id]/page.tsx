import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeft } from "lucide-react";
import ResumePreview from "@/app/(dashboard)/candidates/[id]/resume-preview";
import VendorCandidateEditForm from "./vendor-candidate-edit-form";
import type { VendorCandidateRow } from "../vendor-candidates-table";
import { friendlyVendorError } from "@/lib/friendly-error";

const STAGE_TINT: Record<string, string> = {
  sourced: "bg-slate-100 text-slate-600",
  screened: "bg-sky-50 text-sky-700",
  shortlisted: "bg-indigo-50 text-indigo-700",
  submitted: "bg-indigo-50 text-indigo-700",
  client_interview: "bg-amber-50 text-amber-700",
  offer: "bg-emerald-50 text-emerald-700",
  placed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-50 text-rose-700",
};

// A vendor's own candidate profile -- view + edit, same underlying record
// a recruiter would see, but reachable only for candidates this vendor
// submitted themselves (get_my_vendor_candidates() is scoped to
// created_by_user = auth.uid(); vendor_update_candidate() re-checks the
// same ownership before writing).
export default async function VendorCandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_my_vendor_candidates");
  const candidates: VendorCandidateRow[] = (error ? [] : data ?? []) as VendorCandidateRow[];
  const candidate = candidates.find((c) => c.candidate_id === id);

  if (!error && !candidate) notFound();

  let signedUrl: string | null = null;
  if (candidate?.resume_file_url) {
    const { data: signed } = await supabase.storage
      .from("resumes")
      .createSignedUrl(candidate.resume_file_url, 60 * 60 * 12);
    signedUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="max-w-[900px] mx-auto px-5 py-6">
      <Link href="/vendor/candidates" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> My Candidates
      </Link>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {friendlyVendorError(error.message, "vendor-candidate-detail")}
        </div>
      )}

      {candidate && (
        <>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-[20px] font-semibold text-slate-900">{candidate.full_name}</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">{candidate.email}</p>
            </div>
            {signedUrl && (
              <ResumePreview signedUrl={signedUrl} fileName={`${candidate.full_name}-resume`} label="View resume" />
            )}
          </div>

          <div className="mb-6">
            <h2 className="text-[13px] font-semibold text-slate-900 mb-2">Mandates this candidate is on</h2>
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {candidate.mandates.map((m) => (
                <div key={m.mandate_id} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-slate-900">
                      {m.role_title} <span className="text-slate-400 font-normal">· {m.client_display}</span>
                    </span>
                    <span className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${STAGE_TINT[m.stage] ?? "bg-slate-100 text-slate-600"}`}>
                      {m.stage}
                    </span>
                  </div>
                  {m.stage === "rejected" && m.rejection_reason && (
                    <p className="text-[12px] text-rose-600 mt-1">Client feedback: {m.rejection_reason}</p>
                  )}
                  {m.vendor_update_note && (
                    <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">
                      Note from StaffAnchor: {m.vendor_update_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <h2 className="text-[13px] font-semibold text-slate-900 mb-2">Edit profile</h2>
          <VendorCandidateEditForm candidate={candidate} />
        </>
      )}
    </div>
  );
}
