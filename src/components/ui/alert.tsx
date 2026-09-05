import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "success" | "error" | "warning" | "info";

// Inline success/error/warning message strip -- formalizes the pattern
// re-typed by hand across the app (mandate-candidates-view's scoreMessage,
// candidates-table's bulk-action message, form-save errors, etc.), each
// with its own slightly different className. One primitive, same tone
// vocabulary as Badge (success/warning/danger/info -- "error" here reads
// clearer than "danger" for a full-sentence message rather than a one-word
// tag), so a save-failed message looks the same wherever it appears.
const TONE_CLASSES: Record<AlertTone, string> = {
  success: "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-800/60",
  error: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 ring-rose-200/60 dark:ring-rose-800/60",
  warning: "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 ring-amber-200/60 dark:ring-amber-800/60",
  info: "bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 ring-sky-200/60 dark:ring-sky-800/60",
};

const TONE_ICON: Record<AlertTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: AlertTone;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-ros-md px-3 py-2 text-ros-body-sm ring-1 animate-fade-in",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
