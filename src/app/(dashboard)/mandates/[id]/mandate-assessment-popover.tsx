"use client";

import { useRef, useState } from "react";
import { Sparkles, Loader2, ShieldAlert, CircleCheck, HelpCircle, RotateCw } from "lucide-react";

export type MandateAssessment = {
  recommendation: "Strong Fit" | "Fit with Reservations" | "Not a Fit";
  positives: string[];
  red_flags: string[];
  missing: string[];
};

const RECOMMENDATION_STYLE: Record<MandateAssessment["recommendation"], string> = {
  "Strong Fit": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Fit with Reservations": "bg-amber-50 text-amber-700 border-amber-200",
  "Not a Fit": "bg-rose-50 text-rose-700 border-rose-200",
};

const POPOVER_WIDTH = 340;
const POPOVER_EST_HEIGHT = 340;

// Mandate-specific AI read -- replaces the old candidate-level
// ai_decision_flags badge, which showed the exact same "red flags" for a
// candidate no matter which mandate you were looking at (and lumped
// "field not filled in" together with genuine red flags, e.g. flagging
// undisclosed CTC as a risk). This popover instead renders the three-way
// met/not_met/unclear verdict this mandate's own matching run already
// computed: positives (green, evidence-backed), red flags (red,
// evidence-backed), missing (neutral -- simply not addressed, not a
// strike). Same fixed-position-escape-overflow-hidden technique as
// ApplicationAnswersQuickView, since this lives inside the same
// overflow-hidden table/board containers.
export default function MandateAssessmentPopover({
  assessment,
  onReassess,
  reassessing = false,
}: {
  assessment: MandateAssessment | null;
  onReassess?: () => void;
  reassessing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  if (!assessment) {
    return onReassess ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReassess();
        }}
        disabled={reassessing}
        className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
      >
        {reassessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {reassessing ? "Assessing…" : "Assess for this mandate"}
      </button>
    ) : (
      <span className="text-[11px] text-slate-300">—</span>
    );
  }

  const computePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < POPOVER_EST_HEIGHT && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8);
    if (openAbove) {
      setPos({ bottom: window.innerHeight - rect.top + 4, left });
    } else {
      setPos({ top: rect.bottom + 4, left });
    }
  };

  const handleOpen = () => {
    computePosition();
    setOpen(true);
  };

  const { recommendation, positives, red_flags: redFlags, missing } = assessment;

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={handleOpen}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            handleOpen();
          }
        }}
        title="Hover or click for the full read"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap cursor-help transition-colors ${RECOMMENDATION_STYLE[recommendation]}`}
      >
        {recommendation}
        {redFlags.length > 0 && (
          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[8.5px] font-bold leading-none">
            {redFlags.length}
          </span>
        )}
        <HelpCircle className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && pos && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH }}
          className="z-50 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        >
          <div className={`px-3.5 py-2.5 flex items-center justify-between border-b ${RECOMMENDATION_STYLE[recommendation]}`}>
            <span className="text-[12.5px] font-bold">{recommendation}</span>
            <span className="text-[10px] font-medium opacity-70 uppercase tracking-wide">This mandate only</span>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {redFlags.length > 0 && (
              <div className="px-3.5 py-2.5 bg-rose-50/40 dark:bg-rose-950/10">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-rose-700 mb-1.5">
                  <ShieldAlert className="w-3 h-3" /> Red Flags
                </p>
                <ul className="space-y-1">
                  {redFlags.map((f, i) => (
                    <li key={i} className="text-[12px] text-rose-900 dark:text-rose-200 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-rose-400">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {positives.length > 0 && (
              <div className="px-3.5 py-2.5 bg-emerald-50/40 dark:bg-emerald-950/10">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-emerald-700 mb-1.5">
                  <CircleCheck className="w-3 h-3" /> Positives
                </p>
                <ul className="space-y-1">
                  {positives.map((f, i) => (
                    <li key={i} className="text-[12px] text-emerald-900 dark:text-emerald-200 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-emerald-400">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {missing.length > 0 && (
              <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40">
                <p className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1.5">
                  <HelpCircle className="w-3 h-3" /> Missing -- confirm on a call
                </p>
                <ul className="space-y-1">
                  {missing.map((f, i) => (
                    <li key={i} className="text-[12px] text-slate-700 dark:text-slate-300 leading-snug pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-400">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {redFlags.length === 0 && positives.length === 0 && missing.length === 0 && (
              <p className="px-3.5 py-3 text-[12px] text-slate-400">No detailed reasoning recorded for this run.</p>
            )}
          </div>

          {onReassess && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReassess();
              }}
              disabled={reassessing}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border-t border-slate-100 dark:border-slate-800 disabled:opacity-60"
            >
              {reassessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
              {reassessing ? "Re-assessing…" : "Re-assess against this mandate"}
            </button>
          )}
        </div>
      )}
    </span>
  );
}
