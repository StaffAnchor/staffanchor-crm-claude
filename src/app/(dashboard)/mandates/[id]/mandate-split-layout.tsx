"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <div className={collapsed ? "grid grid-cols-[1fr_auto] gap-3 items-start" : "grid grid-cols-3 gap-6"}>
        <div className={collapsed ? "" : "col-span-2"}>{left}</div>

        {/* Toggle now lives directly above the panel it controls (was
            floating over the left/candidates column, right under the stat
            tiles, which read as unrelated to "mandate details" and got
            visually lost). Kept in its own always-rendered column so it's
            still reachable to re-open the panel once collapsed.
            Deliberately full-width and bar-shaped (not a small corner pill)
            so it reads as a header/handle for the whole panel below it --
            the point being that anyone landing on this page should be able
            to tell, at a glance, that clicking this slides the entire
            details panel away, not just some minor utility action. */}
        <div>
          <Button
            variant="ghost"
            onClick={() => setCollapsed((c) => !c)}
            className="w-full justify-center mb-2 border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:border-indigo-300"
            title={collapsed ? "Show mandate details panel" : "Hide mandate details panel for more room"}
            icon={collapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
          >
            {collapsed ? "Show mandate details panel" : "Hide mandate details panel"}
          </Button>
          {!collapsed && right}
        </div>
      </div>
    </div>
  );
}
