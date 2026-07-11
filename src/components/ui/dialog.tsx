"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onClose,
  title,
  children,
  widthClassName = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative w-full bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-lg animate-fade-in",
          widthClassName
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 h-12 border-b border-slate-100 dark:border-slate-800 dark:border-slate-700">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 dark:text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="ros-focusable text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-ros-sm p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
