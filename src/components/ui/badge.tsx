import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  accent: "bg-blue-50 text-blue-700 ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
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
}: {
  tone?: BadgeTone;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold uppercase tracking-wide rounded-ros-full ring-1 whitespace-nowrap",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2.5 py-1",
        TONE_CLASSES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
