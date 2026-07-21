import Link from "next/link";
import { cn } from "@/lib/cn";

// A smaller, pill-shaped sibling to StatTile -- for rows where 5-8 numbers
// need to sit compactly on one line (source bifurcation, new-additions
// cadence, pipeline disposition) rather than each claiming a full square
// card. Value + label share one line instead of stacking, so a whole row
// of these reads as one glanceable strip.
const TONE_CLASSES = {
  neutral: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300",
  accent: "border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300",
  success: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
  danger: "border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300",
  info: "border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300",
} as const;

const DOT_CLASSES = {
  neutral: "bg-slate-300 dark:bg-slate-600",
  accent: "bg-blue-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  info: "bg-sky-400",
} as const;

export type MiniStatTone = keyof typeof TONE_CLASSES;

export function MiniStat({
  value,
  label,
  href,
  tone = "neutral",
  title,
}: {
  value: string | number;
  label: string;
  href?: string;
  tone?: MiniStatTone;
  title?: string;
}) {
  // A tile reading "0" in a bright accent color draws the eye exactly
  // backwards -- the zeros are the least interesting numbers on the page.
  // Fading them to a quiet neutral keeps every color pop reserved for
  // numbers that actually moved.
  const isZero = typeof value === "number" && value === 0;
  const effectiveTone: MiniStatTone = isZero ? "neutral" : tone;
  const content = (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-all duration-200 ease-ros",
        TONE_CLASSES[effectiveTone],
        isZero && "opacity-60",
        href && "hover:-translate-y-px hover:opacity-100 active:translate-y-0 active:scale-[0.98] cursor-pointer hover:shadow-ros-sm"
      )}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function StatSection({
  title,
  tone = "neutral",
  children,
}: {
  title: string;
  tone?: MiniStatTone;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex flex-col align-top">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full", DOT_CLASSES[tone])} />
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5 max-w-md">{children}</div>
    </div>
  );
}
