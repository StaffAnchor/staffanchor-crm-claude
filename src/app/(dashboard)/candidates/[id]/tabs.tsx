"use client";

import { useEffect, useState, type ReactNode } from "react";

export default function Tabs({
  tabs,
}: {
  tabs: { label: string; content: ReactNode }[];
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
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-5">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all duration-200 ease-ros ${
              active === i
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="animate-fade-in">{tabs[active].content}</div>
    </div>
  );
}
