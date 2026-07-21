import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FillProbability } from "@/lib/fill-probability";

const BUCKET_STYLES: Record<FillProbability["bucket"], { border: string; bg: string; text: string; iconBg: string }> = {
  high: {
    border: "border-emerald-100 dark:border-emerald-900",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300",
  },
  medium: {
    border: "border-amber-100 dark:border-amber-900",
    bg: "bg-amber-50/40 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300",
  },
  low: {
    border: "border-red-100 dark:border-red-900",
    bg: "bg-red-50/40 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    iconBg: "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300",
  },
};

// Same visual language as StatTile (shared health-strip row), but with a
// bucket-colored surface instead of the neutral/blue-accent choice --
// fill probability needs a good/warning/bad read at a glance, which a
// single accent color can't carry. Deliberately a plain heuristic (see
// lib/fill-probability.ts) rather than another Gemini call: instant, free,
// and the "driver" line is directly traceable to a real number instead of
// an opaque model output.
export function FillProbabilityTile({ probability }: { probability: FillProbability }) {
  const s = BUCKET_STYLES[probability.bucket];
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-ros-lg border px-3 py-2.5 transition-all duration-200 ease-ros",
        "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
        s.border,
        s.bg
      )}
      title={probability.driver}
    >
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-ros-md", s.iconBg)}>
        <TrendingUp className="h-4 w-4" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className={cn("text-[17px] font-semibold tabular-nums", s.text)}>{probability.score}%</p>
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[9rem]">
          Fill probability
        </p>
      </div>
    </div>
  );
}
