import { Check, Circle } from "lucide-react";
import { profileChecklist, type ChecklistInput } from "@/lib/profile-checklist";
import { profileLabel } from "@/lib/sub-group";

/** The plain answer to "how complete is this profile, and what is missing": the label, then a tick or a gap per detail. */
export default function ProfileChecklist({ candidate, roleLevelKnown, group, subGroup }: { candidate: ChecklistInput; roleLevelKnown: boolean; group: string | null; subGroup: string | null }) {
  const items = profileChecklist(candidate, roleLevelKnown);
  const have = items.filter((i) => i.have).length;
  const label = profileLabel(group, subGroup);
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-700 dark:bg-slate-800/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {label && <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200">{label}</span>}
        <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
          {have} of {items.length} details{have === items.length ? ". Complete." : ""}
        </span>
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <li
            key={i.key}
            title={i.have ? "Have it" : `Missing: ${i.why}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${i.have ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800"}`}
          >
            {i.have ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />} {i.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
