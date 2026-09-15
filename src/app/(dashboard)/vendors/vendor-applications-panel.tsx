"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, FileText } from "lucide-react";

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

// Same relative-time format used on the calls-flagged table elsewhere in
// the CRM ("3d ago" etc.) -- keeps timestamp styling consistent app-wide.
function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function expYears(v: number | null) {
  return v === null ? "—" : `${v % 1 === 0 ? v : v.toFixed(1)}y`;
}

// Full-width table (was a narrow expandable list crammed into the sidebar
// card) -- pending self-serve applications are a queue to work through, so
// this now matches the same table-with-expandable-row pattern used for
// vendor agencies just above it and for placements/calls-flagged elsewhere
// in the CRM, rather than a cramped accordion.
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
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-6 text-center text-[13px] text-slate-400">
        No pending applications from vendors.staffanchor.com.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      {error && (
        <p className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50">{error}</p>
      )}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 w-6" />
            <th className="text-left px-2 py-2.5">Applicant</th>
            <th className="text-left px-4 py-2.5">Location</th>
            <th className="text-left px-4 py-2.5">Experience</th>
            <th className="text-left px-4 py-2.5">LinkedIn</th>
            <th className="text-left px-4 py-2.5">Applied</th>
            <th className="text-left px-4 py-2.5">Resume</th>
            <th className="text-left px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {applications.map((a) => {
            const expanded = expandedId === a.id;
            return (
              <Fragment key={a.id}>
                <tr
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 text-slate-400">
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{a.full_name}</p>
                    <p className="text-[11px] text-slate-400">{a.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.current_location ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">
                    {expYears(a.total_experience_years)} total · {expYears(a.b2b_sales_hiring_experience_years)} B2B
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                    {a.linkedin_connections_band ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{timeAgo(a.created_at)}</td>
                  <td className="px-4 py-3">
                    {a.resumeSignedUrl ? (
                      <a
                        href={a.resumeSignedUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" /> View
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => approve(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-2.5 py-1.5 disabled:opacity-60"
                      >
                        {busyId === a.id ? "..." : "Approve"}
                      </button>
                      <button
                        onClick={() => reject(a.id)}
                        disabled={busyId === a.id}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-medium px-2.5 py-1.5 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                    <td />
                    <td colSpan={7} className="px-2 pb-4 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-[12px] text-slate-600 dark:text-slate-400 max-w-4xl">
                        <p>
                          <span className="text-slate-400">Phone:</span> {a.phone ?? "—"}
                          {a.linkedin_url && (
                            <>
                              {" · "}
                              <a
                                href={a.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                              >
                                Profile <ExternalLink className="w-3 h-3" />
                              </a>
                            </>
                          )}
                        </p>
                        <p>
                          <span className="text-slate-400">Enterprise sales hiring exp:</span>{" "}
                          {expYears(a.enterprise_sales_hiring_experience_years)}
                        </p>
                        <p className="sm:col-span-2">
                          <span className="text-slate-400">Roles hired for:</span> {a.roles_hired_for.join(", ") || "—"}
                        </p>
                        <p className="sm:col-span-2">
                          <span className="text-slate-400">Industries:</span> {a.industries_hired_for.join(", ") || "—"}
                        </p>
                        <p>
                          <span className="text-slate-400">Recruiter/Navigator access:</span>{" "}
                          {yesNo(a.has_linkedin_recruiter_or_navigator)}
                        </p>
                        <p>
                          <span className="text-slate-400">Job portal access:</span> {yesNo(a.has_job_portal_access)}
                        </p>
                        <p>
                          <span className="text-slate-400">Wants paid portal access (self-funded):</span>{" "}
                          {yesNo(a.interested_in_paid_job_portal_access)}
                        </p>
                        <p>
                          <span className="text-slate-400">Availability:</span> {a.expected_hours_per_week ?? "—"},{" "}
                          {a.available_to_start
                            ? new Date(a.available_to_start).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </p>
                        <p className="sm:col-span-2">
                          <span className="text-slate-400">Languages:</span> {a.languages_known.join(", ") || "—"}
                        </p>
                        {a.additional_notes && (
                          <p className="sm:col-span-2">
                            <span className="text-slate-400">Notes:</span> {a.additional_notes}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
