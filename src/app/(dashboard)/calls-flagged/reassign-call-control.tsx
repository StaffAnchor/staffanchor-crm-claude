"use client";

import { useState } from "react";
import { UserPlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Lives only in the "all time" analysis view (calls-flagged-table.tsx) --
// the direct answer to "someone hit the tick mark by mistake, or this
// call genuinely needs to go to someone else now": pick a teammate (which
// can be the same person the flag was already for) and this row itself
// is reopened -- status back to open, resolved_at cleared, recruiter_id
// switched to whoever was picked -- rather than inserting a second row
// for the same candidate/mandate. That's the point: "reassigned" should
// mean the flag is open again, full stop, not "there are now two rows,
// one closed and one open" for the same ask.
export default function ReassignCallControl({
  flagId,
  candidateName,
  mandateRoleTitle,
  teamMembers,
  defaultRecruiterId,
  onReassigned,
}: {
  flagId: string;
  candidateName: string;
  mandateRoleTitle: string | null;
  teamMembers: { id: string; full_name: string | null; email: string }[];
  defaultRecruiterId?: string | null;
  onReassigned?: (recruiterId: string) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState(defaultRecruiterId ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!recruiterId) return;
    setSending(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const actor = teamMembers.find((m) => m.id === user?.id);
    const actorLabel = actor?.full_name?.trim() || actor?.email || "A teammate";

    const { error: err } = await supabase
      .from("recruiter_inbox")
      .update({
        recruiter_id: recruiterId,
        status: "open",
        resolved_at: null,
        snoozed_until: null,
        title: `Call ${candidateName}${mandateRoleTitle ? ` — ${mandateRoleTitle}` : ""}`,
        detail: `${actorLabel} reassigned this call -- please call and confirm.`,
      })
      .eq("id", flagId);
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
    onReassigned?.(recruiterId);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
    }, 1200);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-ros-md px-1.5 py-1 transition-colors"
        title="Reassign this call (e.g. if it was marked done by mistake)"
      >
        <UserPlus className="w-3 h-3" /> Reassign
      </button>

      {open && (
        <div
          className="absolute z-40 top-full right-0 mt-1 w-56 rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-md p-3"
          onClick={(e) => e.stopPropagation()}
        >
          {sent ? (
            <p className="text-[12px] text-emerald-700 font-medium">Reassigned -- back on their queue as open.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">Reassign to</p>
                <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <select
                autoFocus
                value={recruiterId}
                onChange={(e) => setRecruiterId(e.target.value)}
                className="w-full text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1.5 bg-white dark:bg-slate-900 mb-2"
              >
                <option value="">Select teammate...</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name?.trim() || m.email}
                  </option>
                ))}
              </select>
              {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
              <button
                type="button"
                onClick={send}
                disabled={!recruiterId || sending}
                className="w-full flex items-center justify-center gap-1 rounded-ros-md bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium px-2 py-1.5 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Reassign
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
