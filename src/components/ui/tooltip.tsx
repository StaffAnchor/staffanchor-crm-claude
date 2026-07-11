"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

// Lightweight hover tooltip -- CSS-only positioning (no portal), good enough
// for short labels on icons/buttons. For rich content (e.g. the AI summary
// preview), keep using a dedicated component -- this is for simple text.
export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-50 whitespace-nowrap rounded-ros-sm bg-slate-900 dark:bg-slate-700 text-white text-[11px] px-2 py-1 shadow-ros-md animate-fade-in pointer-events-none",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
