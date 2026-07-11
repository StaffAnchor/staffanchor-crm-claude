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
      className={cn(
        "shrink-0 flex items-center gap-1.5 text-[12px] font-medium rounded-ros-full px-3 py-1.5 ring-1 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}
