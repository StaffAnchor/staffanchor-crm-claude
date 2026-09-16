"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import ResumePreview from "@/app/(dashboard)/candidates/[id]/resume-preview";

export type VendorMandateLink = {
  mandate_id: string;
  role_title: string;
  client_display: string;
  stage: string;
  rejection_reason: string | null;
  vendor_update_note: string | null;
  vendor_update_note_at: string | null;
  submitted_at: string;
};

export type VendorCandidateRow = {
  candidate_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  current_employer: string | null;
  current_job_title: string | null;
  linkedin_url: string | null;
  resume_file_url: string | null;
  created_at: string;
  mandates: VendorMandateLink[];
};

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

export default function VendorCandidatesTable({
  rows,
  signedUrlByPath,
}: {
  rows: VendorCandidateRow[];
  signedUrlByPath: Record<string, string>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const haystack = [
        r.full_name,
        r.email,
        r.current_location,
        r.current_employer,
        r.current_job_title,
        ...r.mandates.map((m) => m.role_title),
        ...r.mandates.map((m) => m.client_display),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query]);

  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, mandate, employer..."
          className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-[13px]"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Candidate</th>
              <th className="text-left px-4 py-2.5">Location</th>
              <th className="text-left px-4 py-2.5">Experience</th>
              <th className="text-left px-4 py-2.5">Mandate(s)</th>
              <th className="text-left px-4 py-2.5">Resume</th>
              <th className="text-left px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const signedUrl = r.resume_file_url ? signedUrlByPath[r.resume_file_url] : undefined;
              return (
                <tr key={r.candidate_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/vendor/candidates/${r.candidate_id}`}
                      className="font-medium text-slate-900 hover:text-teal-600"
                    >
                      {r.full_name}
                    </Link>
                    <p className="text-[11px] text-slate-400">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.current_location ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">
                    {r.total_experience_years !== null ? `${r.total_experience_years}y` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {r.mandates.map((m) => (
                        <div key={m.mandate_id} className="flex items-center gap-1.5">
                          <span className="text-[12px] text-slate-600 truncate max-w-[160px]">{m.role_title}</span>
                          <span
                            className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 ${
                              STAGE_TINT[m.stage] ?? "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {m.stage}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {signedUrl ? (
                      <ResumePreview signedUrl={signedUrl} fileName={`${r.full_name}-resume`} label="View" />
                    ) : (
                      <span className="text-slate-300 text-[12px]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/vendor/candidates/${r.candidate_id}`}
                      className="text-[12px] font-medium text-teal-600 hover:text-teal-700"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-[13px]">
                  No candidates match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
