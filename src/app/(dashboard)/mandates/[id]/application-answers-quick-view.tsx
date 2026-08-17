"use client";

import { useState } from "react";
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
export default function ApplicationAnswersQuickView({
  answers,
  children,
}: {
  answers: ApplicationAnswer[] | undefined;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!answers || answers.length === 0) return <>{children}</>;

  return (
    <span
      className="relative inline-flex items-center gap-1"
      onMouseEnter={() => setOpen(true)}
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
          setOpen((v) => !v);
        }}
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 hover:bg-indigo-100"
        title={`${answers.length} application answer${answers.length === 1 ? "" : "s"}`}
      >
        <ClipboardList className="w-2.5 h-2.5" />
      </button>

      {open && (
        <div
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="absolute z-30 top-full left-0 mt-1 w-64 rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-3"
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
