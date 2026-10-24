"use client";

import type { Fix } from "@/lib/candidate-next-actions";
import type { HubTab, Panel } from "./action-center";

export type TodoRow = { key: string; text: string; impact: string; urgent: boolean; fix: Fix };

const BUTTON: Record<Fix, { label: string; panel?: Panel; tab?: HubTab; call?: boolean; goTab?: string; edit?: boolean }> = {
  ask_missing: { label: "Ask them", panel: "message", tab: "official" },
  get_cv: { label: "Ask for the CV", panel: "message", tab: "email" },
  confirm_phone: { label: "Fix the number", edit: true },
  call: { label: "Call them", call: true },
  add_role: { label: "Choose a role", panel: "label" },
  record_call: { label: "Open call notes", goTab: "Calls & notes" },
};

// Every open item for this person, with what it blocks and one button that does the fix.
export default function TodoList({ todos }: { todos: TodoRow[] }) {
  function run(f: Fix) {
    const b = BUTTON[f];
    if (b.panel) window.dispatchEvent(new CustomEvent("profile-open-panel", { detail: { panel: b.panel, tab: b.tab } }));
    if (b.call) window.dispatchEvent(new Event("profile-call"));
    if (b.goTab) window.dispatchEvent(new CustomEvent("profile-open-tab", { detail: b.goTab }));
    if (b.edit) window.dispatchEvent(new Event("profile-edit"));
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {todos.map((t, i) => (
        <li key={t.key} className="flex items-start gap-3 py-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.urgent ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{t.text}</p>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{t.impact}</p>
          </div>
          <button type="button" onClick={() => run(t.fix)} className={`shrink-0 rounded-ros-md px-3 py-1 text-[12.5px] font-medium ${i === 0 ? "bg-teal-600 text-white hover:bg-teal-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"}`}>
            {BUTTON[t.fix].label}
          </button>
        </li>
      ))}
    </ul>
  );
}
