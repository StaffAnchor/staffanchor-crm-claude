"use client";

import { useEffect, useState, type ReactNode } from "react";

export type TabTone = "teal" | "violet" | "sky" | "emerald" | "amber" | "slate";

// Each tab has its own colour so you always know which room you are in. The active tab is a tinted pill with a solid
// icon; the others keep a quiet icon in the same hue so the colours are learned, not decorative.
const TONE: Record<TabTone, { on: string; icon: string }> = {
  teal: { on: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800", icon: "text-teal-600" },
  violet: { on: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:ring-violet-800", icon: "text-violet-500" },
  sky: { on: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-800", icon: "text-sky-500" },
  emerald: { on: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-800", icon: "text-emerald-500" },
  amber: { on: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-800", icon: "text-amber-500" },
  slate: { on: "bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700", icon: "text-slate-400" },
};

export default function Tabs({
  tabs,
}: {
  tabs: { label: string; content: ReactNode; icon?: ReactNode; tone?: TabTone }[];
}) {
  const [active, setActive] = useState(0);
  // The to-do list can ask for a tab by name ("Calls & notes").
  useEffect(() => {
    const on = (e: Event) => {
      const i = tabs.findIndex((t) => t.label === (e as CustomEvent<string>).detail);
      if (i >= 0) {
        setActive(i);
        document.getElementById("profile-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("profile-open-tab", on);
    return () => window.removeEventListener("profile-open-tab", on);
  }, [tabs]);

  return (
    <div id="profile-tabs">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {tabs.map((tab, i) => {
          const tone = TONE[tab.tone ?? "teal"];
          const on = active === i;
          return (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13.5px] font-medium ring-1 transition-colors duration-150 ${
                on ? `${tone.on} shadow-sm` : "text-slate-600 ring-transparent hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/60"
              }`}
            >
              {tab.icon ? <span className={on ? "" : tone.icon}>{tab.icon}</span> : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="animate-fade-in">{tabs[active].content}</div>
    </div>
  );
}
