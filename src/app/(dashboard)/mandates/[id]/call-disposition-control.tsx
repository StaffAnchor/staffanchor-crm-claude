"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCheck, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CALL_DISPOSITIONS, CALL_DISPOSITION_COLOR, callDispositionLabel, applyCallDisposition, type CallDisposition } from "@/lib/mandate-stage";

// The other half of flag-for-call-button.tsx: that button asks someone to
// call a candidate, this one records what happened on the call and closes
// the loop. Deliberately the SAME component used from the mandate Table
// (next to Flag for call) and from the cross-mandate /calls-flagged page
// -- one control, one write path (applyCallDisposition), so a disposition
// set from either place means the same thing and has the same stage side
// effect (see the doc comment on applyCallDisposition in mandate-stage.ts).
//
// The dropdown is portalled to document.body with position:fixed computed
// from the trigger's own bounding rect, NOT absolutely positioned inside
// the table -- both the mandate Table and /calls-flagged wrap their table
// in a rounded-corners `overflow-hidden` container, which was silently
// clipping an in-flow absolute popover for any row near the table's
// bottom edge (reported: dropdown barely visible, "not interested"/
// "declined" not showing at all). A portal renders outside that
// container entirely, so it can never be clipped by it.
//
// recruiterInboxId is optional: it's only present when this candidate has
// an actual open call flag (the /calls-flagged page always has one; the
// mandate table might not, if nobody's flagged this candidate yet -- the
// control still works, it just has nothing to close out). When present
// and the disposition is a real outcome (anything but "not picked up"),
// the originating flag is marked done too -- "not picked up" deliberately
// leaves it open since it isn't an outcome yet, just a reason to retry.
export default function CallDispositionControl({
  linkId,
  candidateId,
  candidateName,
  mandateId,
  mandateRoleTitle,
  clientName,
  currentStage,
  currentDisposition,
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
  currentDisposition: string | null;
  recruiterInboxId?: string | null;
  onApplied?: (disposition: CallDisposition) => void;
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
      // Flips to open upward when there isn't ~260px below (the popover's
      // rough height with all 4 options + error room) so it doesn't run
      // off the bottom of the viewport either.
      const opensUp = window.innerHeight - rect.bottom < 260;
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

  async function choose(disposition: CallDisposition) {
    setSaving(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      await applyCallDisposition(supabase, {
        linkId,
        candidateId,
        mandateId,
        candidateName,
        mandateLabel: `${mandateRoleTitle ?? "Mandate"}${clientName ? ` — ${clientName}` : ""}`,
        currentStage,
        disposition,
        actorId: user.id,
      });
      if (recruiterInboxId && disposition !== "not_picked_up") {
        await supabase
          .from("recruiter_inbox")
          .update({ status: "done", resolved_at: new Date().toISOString() })
          .eq("id", recruiterInboxId);
      }
      onApplied?.(disposition);
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
          currentDisposition
            ? CALL_DISPOSITION_COLOR[currentDisposition as CallDisposition] ?? "bg-slate-100 text-slate-600"
            : "text-slate-600 dark:text-slate-400 hover:text-blue-700 hover:bg-blue-50"
        }`}
        title="Record the outcome of a call with this candidate"
      >
        <ClipboardCheck className="w-3 h-3" /> {currentDisposition ? callDispositionLabel(currentDisposition) : "Call outcome"}
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
              {CALL_DISPOSITIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  disabled={saving}
                  onClick={() => choose(d.value)}
                  className={`text-left text-[11.5px] rounded-ros-md px-2 py-1.5 hover:opacity-80 disabled:opacity-50 ${CALL_DISPOSITION_COLOR[d.value]}`}
                >
                  {saving ? <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> : null}
                  {d.label}
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
