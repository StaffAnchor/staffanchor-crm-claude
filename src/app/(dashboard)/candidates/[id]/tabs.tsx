"use client";

import { useEffect, useState, type ReactNode } from "react";

export type TabTone = "teal" | "violet" | "sky" | "emerald" | "amber" | "slate";

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
      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab, i) => {
          const on = active === i;
          return (
            <button
              key={tab.label}
              onClick={() => setActive(i)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors duration-150 ${
                on ? "border-teal-600 text-teal-800 dark:text-teal-200" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {tab.icon ? <span className={on ? "text-teal-600" : "text-slate-400"}>{tab.icon}</span> : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="animate-fade-in">{tabs[active].content}</div>
    </div>
  );
}
