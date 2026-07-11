import { cn } from "@/lib/cn";

// Filter-chip primitive -- extracted from the exact pattern already used in
// the Priority Actions Inbox filter row (active = solid slate-900, inactive
// = white/ring), so future filter UIs (candidate table, mandates) look
// identical without re-deriving the classes each time.
export function Chip({
  active,
  icon,
  onClick,
  children,
  className,
}: {
  active: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "ros-focusable shrink-0 flex items-center gap-1.5 text-[12px] font-medium rounded-ros-full px-3 py-1.5 ring-1 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        active
          ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 ring-slate-900 dark:ring-slate-100"
          : "bg-white dark:bg-slate-900 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-300 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}
