"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageSquare, Tag } from "lucide-react";

// The two hubs behind two buttons. "Message" holds every way to contact this person; "Label" holds every way to
// classify them. Only one is open at a time. The to-do list opens them by name (window event "profile-open-panel").
export type Panel = "message" | "label" | null;
export type HubTab = "email" | "official" | "browser";

export default function ActionCenter({ message, label, children }: { message: ReactNode; label: ReactNode; children?: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ panel: Panel; tab?: HubTab }>).detail;
      setPanel(d.panel);
      if (d.tab) window.dispatchEvent(new CustomEvent("profile-hub-tab", { detail: d.tab }));
    };
    window.addEventListener("profile-open-panel", on);
    return () => window.removeEventListener("profile-open-panel", on);
  }, []);
  const btn = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-ros-md px-3.5 py-1.5 text-[13px] font-semibold ${on ? "bg-teal-700 text-white" : "bg-teal-600 text-white hover:bg-teal-700"}`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn(panel === "message")} onClick={() => setPanel(panel === "message" ? null : "message")}>
          <MessageSquare className="h-3.5 w-3.5" /> Message
        </button>
        <button type="button" className={btn(panel === "label")} onClick={() => setPanel(panel === "label" ? null : "label")}>
          <Tag className="h-3.5 w-3.5" /> Label
        </button>
        {children}
      </div>
      {panel === "message" && <div className="mt-3 rounded-ros-lg border border-slate-200 p-4 dark:border-slate-700">{message}</div>}
      {panel === "label" && <div className="mt-3 rounded-ros-lg border border-slate-200 p-4 dark:border-slate-700">{label}</div>}
    </div>
  );
}
