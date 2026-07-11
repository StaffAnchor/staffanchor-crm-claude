import { cn } from "@/lib/cn";

// ROS design system: the calm, "Apple premium" alternative to a row of
// solid-color rainbow pills. One neutral surface, one restrained accent
// (used sparingly -- ideally on a single primary tile per row), soft
// borders instead of heavy fills. This is the default pattern for any
// future metrics row (Mandates, Clients, Reports, etc.) -- reach for this
// instead of hand-rolling colored pill buttons.
export function StatTile({
  label,
  value,
  icon,
  accent = false,
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Faint borders (border-slate-100, not -200) so the row reads as
        // one soft canvas rather than ten separately-boxed panels, plus a
        // tiny lift-on-hover / press-on-click so the tiles feel tactile
        // instead of static, matching the row/button physics elsewhere.
        "flex items-center gap-2.5 rounded-ros-lg border bg-white px-3 py-2.5 transition-all duration-200 ease-ros",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        accent ? "border-blue-100 bg-blue-50/40" : "border-slate-100 hover:border-slate-200 hover:shadow-ros-sm",
        className
      )}
    >
      {icon && (
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-ros-md",
            accent ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"
          )}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className={cn("text-[17px] font-semibold tabular-nums", accent ? "text-blue-700" : "text-slate-900")}>
          {value}
        </p>
        <p className="text-[11px] font-medium text-slate-500 whitespace-nowrap">{label}</p>
      </div>
    </div>
  );
}
