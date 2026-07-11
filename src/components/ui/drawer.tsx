"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

// Slide-over drawer primitive -- the redesign brief calls for replacing
// fixed creation forms (mandates first) with a right-side drawer instead of
// a full-page form or a centered modal. Reusable for any future
// "create/edit in a panel" flow.
export function Drawer({
  open,
  onClose,
  title,
  children,
  widthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full bg-white dark:bg-slate-900 h-full shadow-ros-lg flex flex-col animate-fade-in",
          widthClassName
        )}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100 dark:border-slate-800 dark:border-slate-700 shrink-0">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="ros-focusable text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 dark:hover:text-slate-200 rounded-ros-sm p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
