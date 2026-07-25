"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTourSeen } from "@/lib/use-tour-seen";

// A one-time coach-mark that wraps whatever UI element it's introducing
// (a button, a nav link, a new panel) and pops a small callout beneath it
// until the user dismisses it -- inspired by Ceipal's onboarding hints for
// newly shipped features. Framework is generic: any new feature gets a
// tour by picking a fresh `tourKey` and wrapping the entry point, no new
// component needed. Renders nothing extra once seen (or before we know,
// to avoid a flash-of-tooltip on every page load).
export function TourTooltip({
  tourKey,
  title,
  description,
  side = "bottom",
  children,
}: {
  tourKey: string;
  title: string;
  description: string;
  side?: "bottom" | "top";
  children: ReactNode;
}) {
  const { seen, loading, markSeen } = useTourSeen(tourKey);

  if (loading || seen) return <>{children}</>;

  return (
    <div className="relative inline-block">
      {children}
      <div
        className={`absolute z-50 left-0 w-64 rounded-ros-lg bg-slate-900 text-white p-3 shadow-xl animate-in fade-in slide-in-from-top-1 duration-200 ${
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2"
        }`}
      >
        <div
          className={`absolute left-4 w-2 h-2 bg-slate-900 rotate-45 ${side === "bottom" ? "-top-1" : "-bottom-1"}`}
        />
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12.5px] font-semibold">{title}</p>
          <button
            onClick={markSeen}
            className="text-slate-400 hover:text-white shrink-0 -mt-0.5 -mr-0.5"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11.5px] text-slate-300 mt-1 leading-snug">{description}</p>
        <button
          onClick={markSeen}
          className="mt-2 text-[11px] font-medium bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1 transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
