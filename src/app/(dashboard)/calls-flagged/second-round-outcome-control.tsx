"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PhoneCall, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  SECOND_ROUND_OUTCOMES,
  SECOND_ROUND_OUTCOME_COLOR,
  secondRoundOutcomeLabel,
  applySecondRoundOutcome,
  type SecondRoundOutcome,
} from "@/lib/mandate-stage";

// The 2nd/final-round equivalent of call-disposition-control.tsx -- same
// portal-to-body popover pattern (avoids the exact clipping bug that one's
// doc comment describes), but a deliberately different outcome set: a
// round-2 caller isn't deciding "should this go to round 2" (meaningless,
// they're already in it), they're deciding "does this candidate move
// forward, on our own read, or not." See applySecondRoundOutcome in
// mandate-stage.ts for the stage side effects and the notification back to
// whoever originally flagged this for a 2nd round.
//
// recruiterInboxId works the same as in CallDispositionControl: optional,
// and when present the originating flag is marked done for any outcome
// except not_picked_up (still just "try again," not a real outcome yet).
export default function SecondRoundOutcomeControl({
  linkId,
  candidateId,
  candidateName,
  mandateId,
  mandateRoleTitle,
  clientName,
  currentStage,
  currentOutcome,
  recruiterInboxId,
  onApplied,
}: {
  linkId: string;
  candidateId: string;
  candidateName: string;
  mandateId: string;
  mandateRoleTitle: string | null;
  clientName: string | null;
  currentStage: string;
  currentOutcome: string | null;
  recruiterInboxId?: string | null;
  onApplied?: (outcome: SecondRoundOutcome) => void;
}) {
  const supabase = createClient();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openPopover() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const opensUp = window.innerHeight - rect.bottom < 220;
      setCoords({
        top: opensUp ? rect.top + window.scrollY - 4 : rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  async function choose(outcome: SecondRoundOutcome) {
    setSaving(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      await applySecondRoundOutcome(supabase, {
        linkId,
        candidateId,
        mandateId,
        candidateName,
        mandateLabel: `${mandateRoleTitle ?? "Mandate"}${clientName ? ` — ${clientName}` : ""}`,
        currentStage,
        outcome,
        actorId: user.id,
      });
      if (recruiterInboxId && outcome !== "not_picked_up") {
        await supabase
          .from("recruiter_inbox")
          .update({ status: "done", resolved_at: new Date().toISOString() })
          .eq("id", recruiterInboxId);
      }
      onApplied?.(outcome);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        className={`flex items-center gap-1 text-[11.5px] font-medium rounded-ros-md px-2 py-1 transition-colors ${
          currentOutcome
            ? SECOND_ROUND_OUTCOME_COLOR[currentOutcome as SecondRoundOutcome] ?? "bg-slate-100 text-slate-600"
            : "text-slate-600 dark:text-slate-400 hover:text-blue-700 hover:bg-blue-50"
        }`}
        title="Record the outcome of this 2nd/final round call"
      >
        <PhoneCall className="w-3 h-3" /> {currentOutcome ? secondRoundOutcomeLabel(currentOutcome) : "Call outcome"}
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "absolute", top: coords.top, left: coords.left }}
            className="z-50 w-60 rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-xl p-2"
          >
            <div className="flex items-center justify-between mb-1 px-1">
              <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">How did the call go?</p>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {SECOND_ROUND_OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={saving}
                  onClick={() => choose(o.value)}
                  className={`text-left text-[11.5px] rounded-ros-md px-2 py-1.5 hover:opacity-80 disabled:opacity-50 ${SECOND_ROUND_OUTCOME_COLOR[o.value]}`}
                >
                  {saving ? <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> : null}
                  {o.label}
                </button>
              ))}
            </div>
            {error && <p className="text-[11px] text-red-600 mt-1 px-1">{error}</p>}
          </div>,
          document.body
        )}
    </>
  );
}
