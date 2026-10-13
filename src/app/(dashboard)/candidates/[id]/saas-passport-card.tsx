import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FIT_LABEL, HUNTER_LABEL, passportTone, segmentLabel, type PassportRow } from "@/lib/saas-passport";

function Item({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-[13px] ${value ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}`}>{value || "Not known"}</p>
    </div>
  );
}

// The sales facts a hiring manager asks first, in one place. Values come from
// the CV, and from what the candidate or a recruiter confirmed on the profile
// (those win). Anything blank is a question for the next call.
export default function SaasPassportCard({ row }: { row: PassportRow }) {
  const missing = row.passport_missing ?? [];
  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">B2B sales passport</h3>
          {row.practice_fit && <Badge tone="accent">{FIT_LABEL[row.practice_fit]} sales</Badge>}
        </div>
        <Badge tone={passportTone(row.passport_score)}>{row.passport_score}% complete</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
        <Item label="Sells to" value={(row.segments ?? []).map(segmentLabel).join(", ") || null} />
        <Item label="Typical deal size" value={row.deal_size} />
        <Item label="Quota / attainment" value={row.quota} />
        <Item label="Sales cycle" value={row.sales_cycle} />
        <Item label="Hunter or farmer" value={row.hunter_farmer ? HUNTER_LABEL[row.hunter_farmer] : null} />
        <Item label="Role type" value={row.role_motion} />
        <Item label="Largest team led" value={row.team_size} />
        <Item label="Tools" value={(row.tools ?? []).slice(0, 4).join(", ") || null} />
      </div>
      {row.best_achievement && (
        <p className="mt-3 text-[12.5px] text-slate-600 dark:text-slate-300">
          <span className="text-slate-400">Best achievement: </span>
          {row.best_achievement}
        </p>
      )}
      <p className="mt-3 text-[12px] text-slate-500 dark:text-slate-400">
        {missing.length > 0 ? `Ask on the next call: ${missing.join(", ")}.` : "Everything a hiring manager asks first is on file."}{" "}
        {row.confirmed_by_profile ? "Some values were confirmed on the profile." : row.cv_read ? "Read from the CV, not yet confirmed." : "CV not read yet."}
      </p>
    </Card>
  );
}
