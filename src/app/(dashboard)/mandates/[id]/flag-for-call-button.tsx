"use client";

import { useState } from "react";
import { PhoneCall, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Solves a gap the unread/read feature left open: "read" only tells you
// someone looked, not what should happen next. An admin (or any teammate)
// who opens a candidate but isn't sure about fit needs a way to say "I saw
// this, please call and confirm" -- without that being confused with, or
// clearing, the shared read state (opening this popover doesn't touch
// viewed_at at all; the candidate stays exactly as read/unread as it was).
//
// Reuses the same recruiter_inbox table that already drives My Desk (see
// inbox-view.tsx) instead of inventing a parallel notification system --
// the flagged recruiter sees this as a normal task card, same place they
// already look every day. recruiter_inbox's RLS lets any staff member
// INSERT directly (recruiter_inbox_insert: is_staff()), same pattern as
// addToPipeline/toggleShortlist -- no server route needed.
export default function FlagForCallButton({
  candidateId,
  candidateName,
  mandateId,
  mandateRoleTitle,
  teamMembers,
}: {
  candidateId: string;
  candidateName: string;
  mandateId: string;
  mandateRoleTitle: string | null;
  teamMembers: { id: string; full_name: string | null; email: string }[];
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState("");
  const [note, setNote] = useState("");
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

    const { error: err } = await supabase.from("recruiter_inbox").insert({
      task_type: "CANDIDATE_CALL_REQUEST",
      candidate_id: candidateId,
      mandate_id: mandateId,
      recruiter_id: recruiterId,
      priority: "high",
      title: `Call ${candidateName}${mandateRoleTitle ? ` — ${mandateRoleTitle}` : ""}`,
      detail: note.trim() || `${actorLabel} looked at this candidate and wants your read before going further -- please call and confirm.`,
    });
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      setSent(false);
      setRecruiterId("");
      setNote("");
    }, 1200);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11.5px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-ros-md px-2 py-1 transition-colors"
        title="Flag this candidate for a teammate to call"
      >
        <PhoneCall className="w-3 h-3" /> Flag for call
      </button>

      {open && (
        <div
          className="absolute z-40 top-full left-0 mt-1 w-64 rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-md p-3"
          onClick={(e) => e.stopPropagation()}
        >
          {sent ? (
            <p className="text-[12px] text-emerald-700 font-medium">Sent -- it&apos;s on their My Desk now.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">Who should call?</p>
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
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note -- e.g. wasn't sure about fit, please confirm"
                rows={2}
                className="w-full text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1.5 bg-white dark:bg-slate-900 mb-2 resize-none"
              />
              {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}
              <button
                type="button"
                onClick={send}
                disabled={!recruiterId || sending}
                className="w-full flex items-center justify-center gap-1 rounded-ros-md bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium px-2 py-1.5 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Send
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
