"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  b2b_sales_hiring_experience_years: number | null;
  enterprise_sales_hiring_experience_years: number | null;
  roles_hired_for: string[];
  industries_hired_for: string[];
  linkedin_connections_band: string | null;
  has_linkedin_recruiter_or_navigator: boolean | null;
  has_job_portal_access: boolean | null;
  interested_in_paid_job_portal_access: boolean | null;
  expected_hours_per_week: string | null;
  languages_known: string[];
  available_to_start: string | null;
  additional_notes: string | null;
  created_at: string;
  resumeSignedUrl: string | null;
};

function yesNo(v: boolean | null) {
  return v === null ? "—" : v ? "Yes" : "No";
}

export default function VendorApplicationsPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/vendor-applications/${id}/approve`, { method: "POST" });
    const json = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(json.error ?? "Failed to approve application.");
      return;
    }
    router.refresh();
  }

  async function reject(id: string) {
    const reason = window.prompt("Reason for rejecting (optional, not shared with the applicant):") ?? "";
    setBusyId(id);
    setError(null);
    const res = await fetch(`/api/admin/vendor-applications/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rejectionReason: reason || null }),
    });
    const json = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(json.error ?? "Failed to reject application.");
      return;
    }
    router.refresh();
  }

  if (applications.length === 0) {
    return <p className="text-[13px] text-slate-400">No pending applications from vendors.staffanchor.com.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {applications.map((a) => {
        const expanded = expandedId === a.id;
        return (
          <div key={a.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : a.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{a.full_name}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {a.current_location ?? "—"} · {a.total_experience_years ?? "?"}y total ·{" "}
                  {a.b2b_sales_hiring_experience_years ?? "?"}y B2B sales hiring
                </p>
              </div>
              <span className="text-[10px] text-slate-400 shrink-0">
                {new Date(a.created_at).toLocaleDateString()}
              </span>
            </button>
            {expanded && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-3 space-y-2 text-[12px] text-slate-600 dark:text-slate-400">
                <p>
                  <span className="text-slate-400">Contact:</span> {a.email}
                  {a.phone ? ` · ${a.phone}` : ""}
                  {a.linkedin_url ? (
                    <>
                      {" · "}
                      <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        LinkedIn
                      </a>
                    </>
                  ) : null}
                </p>
                <p>
                  <span className="text-slate-400">Enterprise sales hiring exp:</span>{" "}
                  {a.enterprise_sales_hiring_experience_years ?? "—"}y
                </p>
                <p>
                  <span className="text-slate-400">Roles hired for:</span> {a.roles_hired_for.join(", ") || "—"}
                </p>
                <p>
                  <span className="text-slate-400">Industries:</span> {a.industries_hired_for.join(", ") || "—"}
                </p>
                <p>
                  <span className="text-slate-400">LinkedIn connections:</span> {a.linkedin_connections_band ?? "—"}
                  {" · "}
                  <span className="text-slate-400">Recruiter/Nav:</span> {yesNo(a.has_linkedin_recruiter_or_navigator)}
                  {" · "}
                  <span className="text-slate-400">Job portal access:</span> {yesNo(a.has_job_portal_access)}
                  {" · "}
                  <span className="text-slate-400">Wants paid portal access:</span>{" "}
                  {yesNo(a.interested_in_paid_job_portal_access)}
                </p>
                <p>
                  <span className="text-slate-400">Availability:</span> {a.expected_hours_per_week ?? "—"},{" "}
                  {a.available_to_start ?? "—"}
                  {" · "}
                  <span className="text-slate-400">Languages:</span> {a.languages_known.join(", ") || "—"}
                </p>
                {a.additional_notes && (
                  <p>
                    <span className="text-slate-400">Notes:</span> {a.additional_notes}
                  </p>
                )}
                {a.resumeSignedUrl && (
                  <a href={a.resumeSignedUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    View resume
                  </a>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => approve(a.id)}
                    disabled={busyId === a.id}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-60"
                  >
                    {busyId === a.id ? "Working..." : "Approve"}
                  </button>
                  <button
                    onClick={() => reject(a.id)}
                    disabled={busyId === a.id}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium px-3 py-1.5 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
