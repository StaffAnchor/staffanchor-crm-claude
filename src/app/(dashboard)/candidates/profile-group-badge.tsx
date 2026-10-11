import { GROUP_BADGE, GROUP_LABEL, type ProfileGroup } from "@/lib/profile-groups";

// A small, colour-coded label showing which group a profile belongs to, with its sub-group and a
// hint when the CV also shows the other kind of selling or when it is worth a second look.
export function ProfileGroupBadge({
  group,
  subgroup,
  also,
  needsReview,
  reason,
  compact = false,
}: {
  group: string | null | undefined;
  subgroup?: string | null;
  also?: string | null;
  needsReview?: boolean;
  reason?: string | null;
  compact?: boolean;
}) {
  const g = (group ?? "unclear") as ProfileGroup;
  const label = GROUP_LABEL[g] ?? GROUP_LABEL.unclear;
  return (
    <div className="flex flex-col items-start gap-0.5" title={reason ?? undefined}>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${GROUP_BADGE[g] ?? GROUP_BADGE.unclear}`}>
        {label}
        {needsReview && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-label="Worth a second look" />}
      </span>
      {!compact && subgroup && g === "non_sales" && <span className="max-w-[160px] truncate text-[11px] text-slate-500 dark:text-slate-400">{subgroup}</span>}
      {!compact && also && <span className="text-[10.5px] italic text-slate-400">{also}</span>}
    </div>
  );
}
