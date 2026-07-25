"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

// Wraps the mandate detail page's two-column layout (candidates on the
// left, Intake/Screening/Sourcing/Sharing tabs on the right) so the right
// column can be collapsed entirely -- the Kanban board's columns were
// cramped into 2/3 of the page width, and collapsing the individual Intake
// cards (see mandate-candidates-board) only saved vertical space, not the
// horizontal room the board actually needs. Collapsing here hides the
// whole right column and lets the board/table take the full width.
// `left`/`right` are passed in as server-rendered children -- this
// component itself only needs client state for the toggle.
export default function MandateSplitLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-6 relative">
      <div className={collapsed ? "" : "grid grid-cols-3 gap-6"}>
        <div className={collapsed ? "" : "col-span-2"}>
          <div className="flex justify-end mb-1.5">
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center gap-1.5 rounded-ros-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300 transition-all duration-200 ease-ros"
              title={collapsed ? "Show mandate details panel" : "Hide mandate details panel for more room"}
            >
              {collapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
              {collapsed ? "Show details panel" : "Hide details panel"}
            </button>
          </div>
          {left}
        </div>

        {!collapsed && <div>{right}</div>}
      </div>
    </div>
  );
}
