"use client";

import { useState, type ReactNode } from "react";

export default function Tabs({
  tabs,
}: {
  tabs: { label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 mb-5">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all duration-200 ease-ros ${
              active === i
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800"
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
