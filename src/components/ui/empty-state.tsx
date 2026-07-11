import { cn } from "@/lib/cn";
import { CheckCircle2 } from "lucide-react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-ros-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 flex flex-col items-center justify-center text-center px-6",
        className
      )}
    >
      <div className="w-12 h-12 rounded-ros-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center mb-3">
        {icon ?? <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />}
      </div>
      <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300 dark:text-slate-200">{title}</p>
      {description && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
