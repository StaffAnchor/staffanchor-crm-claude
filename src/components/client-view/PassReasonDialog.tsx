"use client";

import { useState } from "react";
import { X } from "lucide-react";

export const PASS_REASONS: { value: string; label: string }[] = [
  { value: "client_skills_gap", label: "Not enough relevant experience" },
  { value: "client_too_junior", label: "Too junior for this role" },
  { value: "client_too_senior", label: "Too senior for this role" },
  { value: "client_salary", label: "Expected pay is too high" },
  { value: "client_industry", label: "Not the right industry or domain" },
  { value: "client_location", label: "Location or work mode doesn't fit" },
  { value: "client_notice_period", label: "Notice period is too long" },
  { value: "client_culture_fit", label: "Concerns on communication or culture fit" },
  { value: "lost_to_other_candidate", label: "We chose another candidate" },
  { value: "role_paused_or_closed", label: "The role is on hold or has changed" },
  { value: "already_interviewed", label: "Already interviewed or in our process" },
  { value: "other_client", label: "Other" },
];

export const passReasonLabel = (value: string | null | undefined) => PASS_REASONS.find((r) => r.value === value)?.label ?? null;

// One quick choice, so every future shortlist for this client gets sharper.
export default function PassReasonDialog({
  candidateName,
  initialReason = "",
  busy,
  onConfirm,
  onCancel,
}: {
  candidateName: string;
  initialReason?: string;
  busy: boolean;
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(initialReason);
  const [note, setNote] = useState("");
  const needsNote = reason === "other_client";
  const canSubmit = !!reason && (!needsNote || note.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Why are you passing?" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold text-slate-900">Why are you passing on {candidateName}?</h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">One tap. It helps us send you a better shortlist next time.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 grid gap-1.5">
          {PASS_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={`rounded-xl border px-3 py-2 text-left text-[13px] ${reason === r.value ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-900" : "border-[#e3ddd1] text-slate-700 hover:bg-[#faf8f4]"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {(reason === "other_client" || reason) && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={needsNote ? "Tell us in a few words" : reason === "already_interviewed" ? "When did you interview them, and how did they come to you? (optional)" : "Anything else we should know? (optional)"}
            className="mt-3 w-full rounded-xl border border-[#e3ddd1] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-indigo-200"
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || busy}
            onClick={() => onConfirm(reason, note)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Pass on this candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}
