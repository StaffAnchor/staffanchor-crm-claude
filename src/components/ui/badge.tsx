import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

// Ring opacity kept low (/60) so the badge reads as a soft tint with a
// whisper of a border rather than a hard-edged pill -- the same
// "modernize the bright pill" pass requested for the Candidates page,
// applied here so every badge everywhere picks it up at once.
const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-slate-200/60 dark:ring-slate-700/60",
  accent: "bg-teal-50 text-teal-700 ring-teal-200/60 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-800/60",
  success:
    "bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800/60",
  warning: "bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60",
  danger: "bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60",
  info: "bg-teal-50 text-teal-700 ring-teal-200/60 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-800/60",
};

// Formalizes the "low-opacity tint bg + colored text + matching ring"
// pattern already used ad hoc across the app (inbox task badges, mandate
// status chips, origin badges, etc.) into one reusable primitive with a
// named tone, per the ROS design-system brief.
export function Badge({
  tone = "neutral",
  size = "md",
  icon,
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 font-semibold uppercase tracking-wide rounded-ros-full ring-1 whitespace-nowrap transition-colors duration-200 ease-ros",
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-xs px-2.5 py-1",
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
