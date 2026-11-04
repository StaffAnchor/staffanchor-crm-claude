"use client";

import { useState } from "react";
import Link from "next/link";
import { useReadOnly } from "./readonly";
import { CalendarClock, Check, ThumbsDown, ThumbsUp, Undo2, Video } from "lucide-react";
import { toast } from "./toast";
import type { BoardCandidate, FeedbackValue } from "./types";
import { formatSlot } from "./ui";
import PassReasonDialog from "./PassReasonDialog";

export default function FeedbackBar({
  candidate,
  onFeedback,
  compact = false,
  onOpenProfile,
}: {
  candidate: BoardCandidate;
  onFeedback: (linkId: string, value: FeedbackValue, interviewAt?: string, extra?: { reason: string; note: string }) => Promise<void>;
  compact?: boolean;
  onOpenProfile?: () => void;
}) {
  const readOnly = useReadOnly();
  const [busy, setBusy] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const current = candidate.client_feedback;

  const [passing, setPassing] = useState(false);
  const [passReason, setPassReason] = useState("");

  async function send(value: FeedbackValue, at?: string, extra?: { reason: string; note: string }) {
    setBusy(true);
    try {
      await onFeedback(candidate.link_id, value, at, extra);
      setScheduling(false);
      setPassing(false);
      setPassReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const base = "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-60";
  const size = compact ? "px-2.5 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]";
  const offGreen = "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100";
  const offIndigo = "border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100";
  const offRose = "border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100";

  // In the CRM the buttons are the client's own decisions, so a recruiter gets a way into the candidate instead.
  if (readOnly) {
    return (
      <Link href={`/candidates/${candidate.candidate_id}`} className="text-[12.5px] font-medium text-teal-700 hover:underline">
        Open this candidate in the CRM →
      </Link>
    );
  }
  const confirmed = formatSlot(candidate.confirmed_interview_at);
  const requested = formatSlot(candidate.requested_interview_at);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => send("interested")}
          className={`${base} ${size} ${current === "interested" ? "bg-emerald-600 text-white" : offGreen}`}
        >
          {current === "interested" ? <Check className="h-3.5 w-3.5" /> : <ThumbsUp className="h-3.5 w-3.5" />} {current === "interested" ? "Shortlisted" : "Shortlist"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => (compact && onOpenProfile ? onOpenProfile() : setScheduling((s) => !s))}
          className={`${base} ${size} ${current === "interview_requested" ? "bg-indigo-600 text-white" : offIndigo}`}
        >
          <Video className="h-3.5 w-3.5" /> {compact ? "Interview" : "Schedule interview"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPassReason("");
            setPassing(true);
          }}
          className={`${base} ${size} ${current === "not_interested" ? "bg-slate-700 text-white" : offRose}`}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Pass
        </button>
      </div>

      {current !== "not_interested" && (
        <button
          type="button"
          onClick={() => {
            setPassReason("already_interviewed");
            setPassing(true);
          }}
          className="mt-2 text-[12px] text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-800"
        >
          Already interviewed or in our process?
        </button>
      )}

      {scheduling && !compact && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-[#e3ddd1] bg-[#faf8f4] p-3">
          <label className="text-[11px] font-medium text-slate-500">
            Preferred date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block rounded-lg border border-[#e3ddd1] bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </label>
          <label className="text-[11px] font-medium text-slate-500">
            Preferred time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 block rounded-lg border border-[#e3ddd1] bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!date || !time) {
                toast.error("Pick both a date and a time.");
                return;
              }
              send("interview_requested", new Date(`${date}T${time}`).toISOString());
            }}
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            Send request
          </button>
        </div>
      )}

      {passing && <PassReasonDialog candidateName={candidate.full_name} initialReason={passReason} busy={busy} onCancel={() => setPassing(false)} onConfirm={(reason, note) => send("not_interested", undefined, { reason, note })} />}

      {(confirmed || requested) && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          {confirmed ? (
            <span>
              Interview confirmed for <span className="font-medium text-slate-800">{confirmed}</span>
            </span>
          ) : (
            <span>
              You proposed <span className="font-medium text-slate-800">{requested}</span>. Awaiting confirmation.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// A pass the client made can be taken back. If the recruiter has already closed the candidate (stage rejected, withdrawn or
// placed) the client cannot reopen it from here, so the card points them to their recruiter instead.
export function ReconsiderBar({ candidate, onFeedback }: { candidate: BoardCandidate; onFeedback: (linkId: string, value: FeedbackValue) => Promise<void> }) {
  const readOnly = useReadOnly();
  const [busy, setBusy] = useState(false);
  if (readOnly) return null;
  if (candidate.client_feedback !== "not_interested") return null;
  const closedByRecruiter = ["rejected", "pulled_back", "placed"].includes(candidate.stage);
  if (closedByRecruiter) {
    return <p className="text-[12px] text-slate-500">Changed your mind? Message your recruiter and they can reopen this candidate.</p>;
  }
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onFeedback(candidate.link_id, "interested");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not save. Please try again.");
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60"
    >
      <Undo2 className="h-3.5 w-3.5" /> {busy ? "Moving…" : "Changed your mind? Move back to Shortlisted"}
    </button>
  );
}
