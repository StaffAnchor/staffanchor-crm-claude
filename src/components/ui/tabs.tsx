"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Minimal, dependency-free tab primitive for the ROS design system --
// built for the mandate detail "cockpit" rebuild (10 independently-saving
// panels that used to render in one long scroll, now grouped behind tabs),
// but generic enough for any future page that needs the same pattern.
// Each tab's content stays mounted (display:none rather than unmount) so
// panel-local state (unsaved edits, expanded sections) survives switching
// tabs -- important here since several panels are forms.
export type TabItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
  content: ReactNode;
};

export function Tabs({ items, defaultKey, className }: { items: TabItem[]; defaultKey?: string; className?: string }) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1 rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActive(item.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-ros-md px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200 ease-ros",
              active === item.key
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-ros-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        ))}
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
