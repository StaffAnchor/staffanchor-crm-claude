"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AnchorBox from "./anchor-box";

// "Ask Anchor" in the header on every page: opens a side panel with the same assistant as the Home page.
export default function AnchorLauncher({ firstName, isAdmin }: { firstName: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ros-focusable inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[14px] font-medium text-teal-800 transition-colors hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200"
        aria-haspopup="dialog"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Ask Anchor</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Anchor">
          <button type="button" aria-label="Close Anchor" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/30" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col bg-white shadow-xl dark:bg-slate-950">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white"><Sparkles className="h-4 w-4" /></span>
                <div>
                  <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Anchor</p>
                  <p className="text-[12px] text-slate-500">Ask, or jump anywhere. Links open in a new tab.</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <AnchorBox firstName={firstName} isAdmin={isAdmin} variant="drawer" />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
