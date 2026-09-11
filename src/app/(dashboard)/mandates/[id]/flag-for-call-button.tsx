"use client";

import { useState } from "react";
import { PhoneCall, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ROUNDS: { value: "1st" | "2nd" | "final"; label: string }[] = [
  { value: "1st", label: "1st round (screen)" },
  { value: "2nd", label: "2nd round" },
  { value: "final", label: "Final round" },
];

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
//
// call_round exists because "flag for call" started as purely a first-screen
// nudge, but the same mechanism is exactly what an admin/manager needs when
// they want to personally take a 2nd or final round -- they just need that
// distinguished from a routine first call so it doesn't get lost in the
// noise. Stored on the same row (not a separate task_type) since everything
// else about the flow -- My Desk card, the header bell, mark-done -- stays
// identical regardless of round.
export type ExistingCallFlag = {
  flagId: string;
  recruiterId: string;
  recruiterName: string;
  round: string | null;
};

export default function FlagForCallButton({
  candidateId,
  candidateName,
  mandateId,
  mandateRoleTitle,
  teamMembers,
  existingFlag = null,
  onFlagged,
}: {
  candidateId: string;
  candidateName: string;
  mandateId: string;
  mandateRoleTitle: string | null;
  teamMembers: { id: string; full_name: string | null; email: string }[];
  // Present when this candidate already has an open flag on this mandate --
  // lets the button show a persistent "Flagged to X" state instead of
  // reverting to the plain "Flag for call" label the moment the toast
  // disappears (that gap was making recruiters re-flag the same candidate,
  // unsure whether the first flag had actually gone through).
  existingFlag?: ExistingCallFlag | null;
  // Called with the new/updated flag so the parent table/board can update
  // its local flaggedCallByCandidate map immediately.
  onFlagged?: (flag: ExistingCallFlag) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [recruiterId, setRecruiterId] = useState(existingFlag?.recruiterId ?? "");
  const [round, setRound] = useState<"1st" | "2nd" | "final">((existingFlag?.round as "1st" | "2nd" | "final") ?? "1st");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function openPopover() {
    // Reseed from the current flag every time it's reopened, so re-editing
    // an existing flag starts from what's actually assigned, not stale
    // first-open state.
    setRecruiterId(existingFlag?.recruiterId ?? "");
    setRound((existingFlag?.round as "1st" | "2nd" | "final") ?? "1st");
    setNote("");
    setError("");
    setSent(false);
    setOpen((o) => !o);
  }

  async function send() {
    if (!recruiterId) return;
    setSending(true);
    setError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const actor = teamMembers.find((m) => m.id === user?.id);
    const actorLabel = actor?.full_name?.trim() || actor?.email || "A teammate";
    const roundLabel = round === "1st" ? null : round === "2nd" ? "2nd Round" : "Final Round";
    const roundAsk = round === "1st" ? "call and confirm" : `set up the ${round === "2nd" ? "2nd" : "final"} round call`;
    const title = `Call ${candidateName}${mandateRoleTitle ? ` — ${mandateRoleTitle}` : ""}${roundLabel ? ` (${roundLabel})` : ""}`;
    const detail = note.trim() || `${actorLabel} wants you to ${roundAsk}.`;

    const isReassign = Boolean(existingFlag);
    const { data: row, error: err } = isReassign
      ? await supabase
          .from("recruiter_inbox")
          .update({
            recruiter_id: recruiterId,
            call_round: round,
            status: "open",
            resolved_at: null,
            snoozed_until: null,
            title,
            detail,
          })
          .eq("id", existingFlag!.flagId)
          .select("id")
          .single()
      : await supabase
          .from("recruiter_inbox")
          .insert({
            task_type: "CANDIDATE_CALL_REQUEST",
            candidate_id: candidateId,
            mandate_id: mandateId,
            recruiter_id: recruiterId,
            priority: "high",
            call_round: round,
            title,
            detail,
          })
          .select("id")
          .single();
    setSending(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
    const recruiter = teamMembers.find((m) => m.id === recruiterId);
    onFlagged?.({
      flagId: row?.id ?? existingFlag?.flagId ?? "",
      recruiterId,
      recruiterName: recruiter?.full_name?.trim() || recruiter?.email || "teammate",
      round,
    });
    setTimeout(() => {
      setOpen(false);
      setSent(false);
    }, 1200);
  }

  const recruiterLabel = existingFlag?.recruiterName ?? null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={openPopover}
        className={
          existingFlag
            ? "flex items-center gap-1 text-[11.5px] font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300 rounded-ros-md px-2 py-1 transition-colors border border-amber-200 dark:border-amber-800"
            : "flex items-center gap-1 text-[11.5px] font-medium text-slate-600 dark:text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-ros-md px-2 py-1 transition-colors"
        }
        title={existingFlag ? `Flagged to ${recruiterLabel} -- click to reassign` : "Flag this candidate for a teammate to call"}
      >
        <PhoneCall className="w-3 h-3" /> {existingFlag ? `Flagged to ${recruiterLabel}` : "Flag for call"}
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
                <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  {existingFlag ? "Reassign this call" : "Who should call?"}
                </p>
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
              <select
                value={round}
                onChange={(e) => setRound(e.target.value as "1st" | "2nd" | "final")}
                className="w-full text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1.5 bg-white dark:bg-slate-900 mb-2"
              >
                {ROUNDS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
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
                {existingFlag ? "Update" : "Send"}
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
