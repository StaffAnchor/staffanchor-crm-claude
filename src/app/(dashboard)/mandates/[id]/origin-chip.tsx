import { CheckCheck, FileInput, History, Sparkles, UserPlus } from "lucide-react";

export type LinkOrigin = "applied" | "team" | "ai" | "vendor" | "earlier";

const STYLE: Record<LinkOrigin, { cls: string; icon: React.ReactNode }> = {
  applied: { cls: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800", icon: <CheckCheck className="h-3 w-3" /> },
  team: { cls: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800", icon: <UserPlus className="h-3 w-3" /> },
  ai: { cls: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-800", icon: <Sparkles className="h-3 w-3" /> },
  vendor: { cls: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800", icon: <FileInput className="h-3 w-3" /> },
  earlier: { cls: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700", icon: <History className="h-3 w-3" /> },
};

// How this person got into the pipeline, in one small chip next to their name.
export default function OriginChip({ origin, label }: { origin?: LinkOrigin | null; label?: string | null }) {
  if (!origin || !label) return null;
  // "Added by <teammate>" says nothing useful when everyone on the team adds people; the "Added by" filter still works.
  if (origin === "team") return null;
  const s = STYLE[origin];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ${s.cls}`} title={label}>
      {s.icon}
      <span className="max-w-[140px] truncate">{label}</span>
    </span>
  );
}
