"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import CallRecordForm, { type CallFormPerson } from "../../candidates/call-record-form";

// Said they are open to roles in the last 90 days (the same window the top tier uses).
const openFresh = (iso: unknown) => !!iso && Date.now() - new Date(String(iso)).getTime() < 90 * 86_400_000;
import RoleFitReview from "./role-fit-review";
import MandateScreeningPanel, { type MandateScreeningContext, type ScreeningCandidate } from "./mandate-screening-panel";

// What the Call companion itself can fix. Everything else on the checklist is a
// profile field the recruiter edits on the candidate page.
const FIXABLE_HERE = new Set(["Expected fixed CTC", "Notice period", "Open to relocation", "Work mode"]);
const CONFIRMATION = "Recruiter confirmation of these details (use Call companion)";

type PanelProps = {
  roleCluster?: string | null;
  mandateContext?: MandateScreeningContext;
  linkId: string;
  mandateId: string;
  candidateId: string;
  blockers: string[];
  onRecheck: () => Promise<void>;
};

/** Everything needed to fill in a call and the details for one person on one role. Used inside the window and inline in the split view. */
export function ConfirmDetailsPanel({ roleCluster = null, mandateContext, linkId, mandateId, candidateId, blockers, onRecheck }: PanelProps) {
  const supabase = createClient();
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  async function loadCandidate() {
    const { data } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
    setCandidate(data as Record<string, unknown> | null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("candidates").select("*").eq("id", candidateId).single();
      if (!cancelled) setCandidate(data as Record<string, unknown> | null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId]);

  const ready = blockers.length === 0;
  const fixableHere = (b: string) =>
    FIXABLE_HERE.has(b) || b === CONFIRMATION || b.startsWith("Candidate confirmed interested") || b.startsWith("Review of") || b.startsWith("A short note") || b.startsWith("This role has no");
  const needsProfileEdit = blockers.filter((b) => !fixableHere(b));

  return (
    <div>
          {ready ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-700">
              <Check className="h-4 w-4" /> Everything is confirmed. This candidate is ready to share.
            </p>
          ) : (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              <p className="font-medium">Still needed ({blockers.length}):</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b === CONFIRMATION ? "Recruiter confirmation: tap the answers in \"Call details\" below and save" : b}</li>
                ))}
              </ul>
              {needsProfileEdit.length > 0 && (
                <p className="mt-2">
                  <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${candidateId}`} className="font-medium underline">
                    Open the candidate page
                  </Link>{" "}
                  to add: {needsProfileEdit.join(", ")}.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
            <RoleFitReview linkId={linkId} mandateId={mandateId} candidateId={candidateId} onSaved={onRecheck} />
          </div>

          {candidate && mandateContext && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Questions for this role</p>
                <p className="text-[12.5px] text-slate-500">{(mandateContext.screening_questions ?? []).length > 0 ? "Role-specific questions to ask on the call; answers are saved against this role." : "No role-specific questions yet. Add some on the Screening tab."}</p>
              </div>
              {(mandateContext.screening_questions ?? []).length > 0 && (
                <button type="button" onClick={() => setQuestionsOpen(true)} className="rounded-lg border border-teal-600 px-3 py-1.5 text-[13px] font-semibold text-teal-700 hover:bg-teal-50">Answer role questions</button>
              )}
            </div>
          )}

          {candidate && (
            <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Call details</p>
              <CallRecordForm
                key={String(candidate.updated_at ?? "")}
                p={{
                  ...(candidate as unknown as CallFormPerson),
                  open_fresh: openFresh(candidate.open_to_work_at),
                  offer_in_hand: typeof (candidate.segment_data as { offer_in_hand?: unknown } | null)?.offer_in_hand === "boolean" ? (candidate.segment_data as { offer_in_hand: boolean }).offer_in_hand : null,
                  offer_ctc: Number((candidate.segment_data as { offer_ctc?: unknown } | null)?.offer_ctc) || null,
                }}
                mode="profile"
                roleCluster={roleCluster}
                onDone={async () => {
                  await loadCandidate();
                  await onRecheck();
                }}
              />
            </div>
          )}
        {candidate && mandateContext && (
          <MandateScreeningPanel
            open={questionsOpen}
            onClose={() => setQuestionsOpen(false)}
            candidate={candidate as unknown as ScreeningCandidate}
            mandateContext={mandateContext}
            onSaved={async () => {
              await loadCandidate();
              await onRecheck();
            }}
          />
        )}

    </div>
  );
}

export default function ConfirmDetailsModal({
  mode = "share",
  roleCluster = null,
  mandateContext,
  linkId,
  mandateId,
  candidateId,
  candidateName,
  blockers,
  onRecheck,
  onShare,
  onClose,
}: {
  /** details: opened any time from the pipeline row, to fill in the call and details; share: opened because sharing was blocked. */
  mode?: "share" | "details";
  roleCluster?: string | null;
  mandateContext?: MandateScreeningContext;
  linkId: string;
  mandateId: string;
  candidateId: string;
  candidateName: string;
  blockers: string[];
  onRecheck: () => Promise<void>;
  onShare: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [sharing, setSharing] = useState(false);
  const ready = blockers.length === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="mt-8 w-full max-w-3xl rounded-xl bg-white dark:bg-slate-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{mode === "details" ? "Call and details" : "Confirm before sharing"}</h2>
            <p className="text-[12.5px] text-slate-500">
              {mode === "details"
                ? `${candidateName}: fill this in whenever you speak to them, before or after sharing. The client only sees the profile once everything is complete.`
                : `${candidateName}: the client will see all of this, so a recruiter confirms it first.`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <ConfirmDetailsPanel roleCluster={roleCluster} mandateContext={mandateContext} linkId={linkId} mandateId={mandateId} candidateId={candidateId} blockers={blockers} onRecheck={onRecheck} />
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
