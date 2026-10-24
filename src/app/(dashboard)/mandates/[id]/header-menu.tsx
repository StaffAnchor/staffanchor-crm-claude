"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// A small dropdown for the role header, so six loose buttons become two: "Share" (everything that goes out to
// candidates or clients) and "More" (status and delete). The buttons inside keep their own behaviour.
export default function HeaderMenu({ label, icon, primary = false, children }: { label: string; icon?: ReactNode; primary?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-ros-md px-3.5 py-2 text-[13px] font-semibold ${
          primary ? "bg-teal-600 text-white hover:bg-teal-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        }`}
      >
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 space-y-1 rounded-ros-lg border border-slate-200 bg-white p-2 shadow-ros-xl dark:border-slate-700 dark:bg-slate-900 [&_button]:w-full [&_button]:justify-start [&_button]:border-transparent [&_button]:bg-transparent [&_button]:shadow-none [&_button:hover]:bg-slate-50 dark:[&_button:hover]:bg-slate-800 [&_a]:w-full [&_a]:justify-start"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
