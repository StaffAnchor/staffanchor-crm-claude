import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "@/components/ui/badge";

// Shared vertical-dot timeline primitive -- Phase 1 of the ROS visual-system
// pass. Built now (ahead of any page using it) so the Career Timeline /
// Sales Passport work in Phase 2 has a ready-made component instead of
// re-deriving the "line + dot + role + dates + tag" layout from scratch.
// Pattern follows the reference mockup shown to the user: a hairline down
// the left edge, a dot per entry, dates right-aligned, one status tag below
// each entry instead of a paragraph of description.

export type TimelineEntry = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  dateRange: ReactNode;
  tag?: { label: ReactNode; tone?: BadgeTone };
  /** Most recent / current entry gets the accent dot; everything else is neutral. */
  emphasized?: boolean;
};

export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  if (entries.length === 0) return null;

  return (
    <div className={cn("relative pl-5", className)}>
      <div
        aria-hidden
        className="absolute left-1 top-1.5 bottom-1.5 w-px bg-slate-200 dark:bg-slate-700"
      />
      <div className="flex flex-col gap-5">
        {entries.map((entry) => (
          <div key={entry.id} className="relative">
            <span
              aria-hidden
              className={cn(
                "absolute -left-4 top-1 w-2.5 h-2.5 rounded-full",
                entry.emphasized ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
              )}
            />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ros-body font-medium text-slate-900 dark:text-slate-100">{entry.title}</p>
              <span className="text-ros-caption text-slate-400 dark:text-slate-500 shrink-0 whitespace-nowrap">
                {entry.dateRange}
              </span>
            </div>
            {entry.subtitle && (
              <p className="text-ros-body-sm text-slate-500 dark:text-slate-400 mt-0.5">{entry.subtitle}</p>
            )}
            {entry.tag && (
              <div className="mt-1.5">
                <Badge tone={entry.tag.tone ?? "neutral"}>{entry.tag.label}</Badge>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
