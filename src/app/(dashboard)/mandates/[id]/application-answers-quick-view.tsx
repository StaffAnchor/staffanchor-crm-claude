"use client";

import { useRef, useState } from "react";
import { ClipboardList } from "lucide-react";

export type ApplicationAnswer = {
  question_text: string;
  answer_type: string;
  answer_text: string | null;
  answer_number: number | null;
  answer_bool: boolean | null;
};

function formatAnswer(a: ApplicationAnswer): string {
  if (a.answer_type === "yes_no") return a.answer_bool == null ? "—" : a.answer_bool ? "Yes" : "No";
  if (a.answer_type === "numeric") return a.answer_number == null ? "—" : String(a.answer_number);
  return a.answer_text ?? "—";
}

const POPOVER_WIDTH = 256; // matches w-64
const POPOVER_EST_HEIGHT = 220; // rough upper bound used to decide whether to flip above the trigger

// Wraps a candidate's name (the `children` -- usually the existing Link) with
// a small badge that reveals their Application Question answers for this
// mandate on hover, without navigating away from the Board/Table. Renders
// `children` untouched (and nothing else) when this candidate has no answers
// on record for this mandate, so it's a no-op for candidates added the
// normal way (not via Quick Apply) or mandates with no questions configured.
//
// Hover-to-open on desktop (the common case, per the ask), but the badge is
// also a real button so a tap toggles it open on touch devices where hover
// doesn't exist.
//
// Positioning: the popover is rendered `position: fixed` with coordinates
// computed from the trigger's getBoundingClientRect() at open-time, rather
// than `position: absolute` inside the row. The table/board containers use
// `overflow-hidden` (for rounded corners), which was clipping the popover
// for any row near the bottom -- fixed positioning escapes that ancestor
// clipping entirely. It also flips to open above the trigger when there
// isn't enough room below the viewport (e.g. the last couple of rows).
export default function ApplicationAnswersQuickView({
  answers,
  children,
}: {
  answers: ApplicationAnswer[] | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  if (!answers || answers.length === 0) return <>{children}</>;

  const computePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < POPOVER_EST_HEIGHT && rect.top > spaceBelow;

    // Keep the popover on-screen horizontally too, in case the trigger sits
    // near the right edge of the viewport.
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

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={handleOpen}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          // Tap-to-toggle fallback for touch devices, where hover never
          // fires -- desktop users get it from hovering the name itself.
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            handleOpen();
          }
        }}
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 hover:bg-indigo-100"
        title={`${answers.length} application answer${answers.length === 1 ? "" : "s"}`}
      >
        <ClipboardList className="w-2.5 h-2.5" />
      </button>

      {open && pos && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH }}
          className="z-50 rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3"
        >
          <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            Application answers
          </p>
          <dl className="space-y-1.5">
            {answers.map((a, i) => (
              <div key={i}>
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">{a.question_text}</dt>
                <dd className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">{formatAnswer(a)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}
