"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Loader2, RefreshCw } from "lucide-react";

export type ReplyRow = { message_id: string; status: string; received_at: string | null; from_email: string | null; candidate_id: string | null; name: string | null; applied: Record<string, string | number> | null; snippet: string | null };

const STATUS: Record<string, { label: string; cls: string }> = {
  applied: { label: "Profile updated", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  unclear: { label: "Couldn't read the answer", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  bounced: { label: "Address invalid, paused", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  soft_bounce: { label: "Temporary delivery problem", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  opt_out: { label: "Asked to stop", cls: "bg-slate-100 text-slate-700 ring-slate-200" },
  no_candidate: { label: "Not a known candidate", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  not_a_reply: { label: "Ignored", cls: "bg-slate-100 text-slate-500 ring-slate-200" },
};
const FIELD: Record<string, string> = { current_fixed_ctc: "Current CTC", expected_fixed_ctc: "Expected CTC", notice_period: "Notice", total_experience_years: "Experience", current_location: "City", current_employer: "Company", current_job_title: "Role" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "");

export default function RepliesPanel({ mailbox, counts, rows }: { mailbox: string | null; counts: Record<string, number>; rows: ReplyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/outreach/replies/check", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Couldn't check the mailbox.");
      else if (d.ok === false) setMsg(d.error ?? "Couldn't read the mailbox.");
      else setMsg(`Read ${d.read} new message${d.read === 1 ? "" : "s"}: ${d.applied} profile${d.applied === 1 ? "" : "s"} updated, ${d.unclear} unclear, ${d.bounced} invalid addresses paused, ${d.softBounced ?? 0} temporary problems, ${d.optedOut} asked to stop.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5 rounded-lg border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            <Inbox className="h-4 w-4 text-slate-400" /> Replies from candidates
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Reads the {mailbox ?? "CRM"} inbox once a day for replies to these emails, fills only blank details, and pauses addresses that bounce. Last 30 days.
          </p>
        </div>
        <button onClick={check} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check replies now
        </button>
      </div>
      {msg && <p className="mb-3 rounded-md bg-slate-100 px-3 py-2 text-[12.5px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{msg}</p>}
      <div className="mb-3 flex flex-wrap gap-2 text-[12px]">
        {(["applied", "unclear", "bounced", "soft_bounce", "opt_out"] as const).map((k) => (
          <span key={k} className={`rounded-full px-2.5 py-1 font-medium ring-1 ${STATUS[k].cls}`}>
            {STATUS[k].label} · {counts[k] ?? 0}
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-slate-400">No replies read yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.message_id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[12.5px]">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {r.candidate_id ? (
                    <Link href={`/candidates/${r.candidate_id}`} className="hover:underline">
                      {r.name ?? r.from_email}
                    </Link>
                  ) : (
                    r.from_email
                  )}
                </p>
                {r.status === "applied" && r.applied ? (
                  <p className="text-slate-500">{Object.entries(r.applied).map(([k, v]) => `${FIELD[k] ?? k}: ${v}`).join(" · ")}</p>
                ) : (
                  r.snippet && <p className="line-clamp-1 text-slate-400">{r.snippet}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-slate-400">{when(r.received_at)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${(STATUS[r.status] ?? STATUS.not_a_reply).cls}`}>{(STATUS[r.status] ?? STATUS.not_a_reply).label}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
