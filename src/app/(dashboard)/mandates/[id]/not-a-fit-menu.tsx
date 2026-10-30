"use client";

import { useEffect, useRef, useState } from "react";
import { Briefcase, ChevronDown, IndianRupee, Layers, MapPin, MoreHorizontal, PhoneOff, Tag } from "lucide-react";

// Why this person is not a fit for the role. The codes are what the system stores and learns from, so they stay as they
// were; only the wording and the one-line explanation are here for the recruiter.
export const NOT_A_FIT_REASONS: { value: string; title: string; hint: string; icon: typeof Briefcase; tone: string }[] = [
  { value: "wrong_role", title: "Different kind of job", hint: "Does another job, not this one (for example support, not sales)", icon: Briefcase, tone: "text-violet-600 bg-violet-50" },
  { value: "wrong_level", title: "Wrong seniority", hint: "Too junior or too senior for this role", icon: Layers, tone: "text-sky-600 bg-sky-50" },
  { value: "wrong_world", title: "Sells something else", hint: "Different product or buyers than this role needs", icon: Tag, tone: "text-amber-600 bg-amber-50" },
  { value: "wrong_city", title: "Location doesn't work", hint: "Based elsewhere and not open to moving", icon: MapPin, tone: "text-emerald-600 bg-emerald-50" },
  { value: "pay_too_high", title: "Pay too high", hint: "Expects more than the budget", icon: IndianRupee, tone: "text-rose-600 bg-rose-50" },
  { value: "not_interested", title: "Not interested", hint: "Said no, or is not looking right now", icon: PhoneOff, tone: "text-slate-600 bg-slate-100" },
  { value: "other", title: "Other", hint: "Something else", icon: MoreHorizontal, tone: "text-slate-600 bg-slate-100" },
];

export default function NotAFitMenu({ onPick }: { onPick: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      // Open below the button, right edges aligned; flip above if it would run off the bottom of the screen.
      const height = 7 * 58 + 12;
      const top = r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4;
      setPos({ top, left: Math.max(8, r.right - 288) });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        Not a fit
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && pos && (
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, width: 288 }} className="z-[60] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why is this person not a fit?</p>
          {NOT_A_FIT_REASONS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(r.value);
                }}
                className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${r.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                  <span className="block text-[11.5px] leading-4 text-slate-500 dark:text-slate-400">{r.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
