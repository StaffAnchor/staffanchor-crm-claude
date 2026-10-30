"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Minimal, dependency-free tab primitive for the ROS design system --
// built for the mandate detail "cockpit" rebuild (10 independently-saving
// panels that used to render in one long scroll, now grouped behind tabs),
// but generic enough for any future page that needs the same pattern.
// Each tab's content stays mounted (display:none rather than unmount) so
// panel-local state (unsaved edits, expanded sections) survives switching
// tabs -- important here since several panels are forms.
// Optional colour per tab, so each room on a long page has its own hue: a tinted pill when open, a coloured icon when not.
export type TabTone = "teal" | "violet" | "sky" | "emerald" | "amber" | "orange" | "rose" | "indigo";
const TONE: Record<TabTone, { on: string; icon: string }> = {
  teal: { on: "bg-teal-50 text-teal-800 ring-teal-300 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800", icon: "text-teal-600" },
  violet: { on: "bg-violet-50 text-violet-800 ring-violet-300 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-800", icon: "text-violet-500" },
  sky: { on: "bg-sky-50 text-sky-800 ring-sky-300 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800", icon: "text-sky-500" },
  emerald: { on: "bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800", icon: "text-emerald-500" },
  amber: { on: "bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800", icon: "text-amber-500" },
  orange: { on: "bg-orange-50 text-orange-800 ring-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:ring-orange-800", icon: "text-orange-500" },
  rose: { on: "bg-rose-50 text-rose-800 ring-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-800", icon: "text-rose-500" },
  indigo: { on: "bg-indigo-50 text-indigo-800 ring-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-800", icon: "text-indigo-500" },
};

export type TabItem = {
  key: string;
  label: string;
  tone?: TabTone;
  icon?: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
};

export function Tabs({ items, defaultKey, className }: { items: TabItem[]; defaultKey?: string; className?: string }) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  // A link like #sharing or #best-matches opens the tab with that key, then scrolls to it.
  useEffect(() => {
    const go = () => {
      const key = window.location.hash.replace(/^#/, "");
      if (key && items.some((i) => i.key === key)) {
        setActive(key);
        setTimeout(() => document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1 rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-1 backdrop-blur-sm">
        {items.map((item) => {
          const tone = item.tone ? TONE[item.tone] : null;
          const on = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActive(item.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-ros-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ease-ros",
                tone
                  ? on
                    ? `${tone.on} ring-1 shadow-ros-sm`
                    : "text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                  : on
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-ros-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              {item.icon ? <span className={tone && !on ? tone.icon : ""}>{item.icon}</span> : null}
              {item.label}
              {item.badge}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {items.map((item) => (
          <div key={item.key} className={cn("space-y-6", active === item.key ? "block" : "hidden")}>
            {item.content}
          </div>
        ))}
      </div>
    </div>
  );
}
