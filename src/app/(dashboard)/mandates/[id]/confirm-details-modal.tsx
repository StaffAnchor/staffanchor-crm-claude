"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CallCompanion from "../../candidates/[id]/call-companion";

// What the Call companion itself can fix. Everything else on the checklist is a
// profile field the recruiter edits on the candidate page.
const FIXABLE_HERE = new Set(["Expected fixed CTC", "Notice period", "Open to relocation", "Work mode"]);
const CONFIRMATION = "Recruiter confirmation of these details (use Call companion)";

export default function ConfirmDetailsModal({
  candidateId,
  candidateName,
  blockers,
  onRecheck,
  onShare,
  onClose,
}: {
  candidateId: string;
  candidateName: string;
  blockers: string[];
  onRecheck: () => Promise<void>;
  onShare: () => Promise<boolean>;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [recruiterName, setRecruiterName] = useState("Recruiter");
  const [sharing, setSharing] = useState(false);

  async function loadCandidate() {
    const { data } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
    setCandidate(data as Record<string, unknown> | null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
      if (!cancelled) setCandidate(data as Record<string, unknown> | null);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
        if (!cancelled) setRecruiterName(prof?.full_name ?? prof?.email ?? "Recruiter");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const ready = blockers.length === 0;
  const needsProfileEdit = blockers.filter((b) => !FIXABLE_HERE.has(b) && b !== CONFIRMATION);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Confirm details before sharing</h2>
            <p className="text-[12.5px] text-slate-500">
              {candidateName}: the client will see these, so a recruiter confirms them first.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {ready ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700">
              <Check className="h-4 w-4" /> Everything is confirmed. This candidate is ready to share.
            </p>
          ) : (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              <p className="font-medium">Still needed ({blockers.length}):</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b === CONFIRMATION ? "Recruiter confirmation: tap the answers below and save" : b}</li>
                ))}
              </ul>
              {needsProfileEdit.length > 0 && (
                <p className="mt-2">
                  <Link href={`/candidates/${candidateId}`} className="font-medium underline">
                    Open the candidate page
                  </Link>{" "}
                  to add: {needsProfileEdit.join(", ")}.
                </p>
              )}
            </div>
          )}

          {candidate && (
            <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
              <CallCompanion
                candidate={candidate as never}
                doubts={[]}
                recruiterName={recruiterName}
                onSaved={async () => {
                  await loadCandidate();
                  await onRecheck();
                }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100">
            Close
          </button>
          <button
            type="button"
            disabled={!ready || sharing}
            onClick={async () => {
              setSharing(true);
              const ok = await onShare();
              setSharing(false);
              if (ok) onClose();
            }}
            className="rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sharing ? "Sharing…" : "Share with client"}
          </button>
        </div>
      </div>
    </div>
  );
}
