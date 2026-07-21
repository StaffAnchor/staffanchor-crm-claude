"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Profile-lifecycle status ONLY. Pipeline progress (shortlisted, submitted,
// client_interview, offer, placed, rejected, etc.) is now tracked per-mandate
// on candidate_mandate_links.stage instead -- see mandate-links-panel.tsx and
// mandate-stage.ts. Setting this field used to silently do nothing anywhere
// else in the system when a candidate had multiple mandates; splitting the
// two concepts is the actual fix for that.
const STATUSES = [
  "awaiting_input",
  "lead",
  "registered",
  "under_review",
  "alumni",
  "inactive",
];

// Legacy pipeline values that may still be sitting in candidates.status from
// before this split. Rendered as a disabled, clearly-labeled option so a
// candidate record with one of these doesn't silently jump to a different
// value the moment this control renders -- but steers the user toward the
// per-mandate panel below instead of letting them keep using this field for
// pipeline stage.
const LEGACY_PIPELINE_VALUES = new Set([
  "shortlisted",
  "submitted",
  "client_interview",
  "client_shortlisted",
  "offer",
  "placed",
]);

const STATUS_STYLE: Record<string, string> = {
  awaiting_input: "bg-amber-50 text-amber-700 ring-amber-200/60",
  lead: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200/60",
  registered: "bg-sky-50 text-sky-700 ring-sky-200/60",
  under_review: "bg-blue-50 text-blue-700 ring-blue-200/60",
  alumni: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200/60",
  inactive: "bg-rose-50 text-rose-600 ring-rose-200/60",
};

export default function StatusControl({
  candidateId,
  currentStatus,
}: {
  candidateId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const isLegacy = LEGACY_PIPELINE_VALUES.has(currentStatus);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("candidates").update({ status: newStatus }).eq("id", candidateId);
    await supabase.from("audit_log").insert({
      actor: user?.id,
      action: "status_change",
      entity: "candidate",
      entity_id: candidateId,
      detail: { from: currentStatus, to: newStatus },
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        defaultValue={currentStatus}
        onChange={handleChange}
        className={`rounded-ros-md border-0 ring-1 px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] cursor-pointer ${
          STATUS_STYLE[currentStatus] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200/60"
        }`}
      >
        {isLegacy && (
          <option value={currentStatus} disabled>
            {currentStatus.replace(/_/g, " ")} (legacy — set per mandate below)
          </option>
        )}
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {isLegacy && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[220px]">
          Pipeline stage now lives per-mandate — use the mandate panel below to update it.
        </p>
      )}
    </div>
  );
}
