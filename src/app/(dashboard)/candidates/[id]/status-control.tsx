"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUSES = [
  "awaiting_input",
  "lead",
  "registered",
  "under_review",
  "shortlisted",
  "submitted",
  "client_interview",
  "offer",
  "placed",
  "alumni",
  "inactive",
];

// Same soft-tint pattern as the shared Badge primitive (ring at /60 opacity)
// so the status pill on this page reads consistently with the one in the
// candidates table, rather than as a separate, harder-edged control.
const STATUS_STYLE: Record<string, string> = {
  awaiting_input: "bg-amber-50 text-amber-700 ring-amber-200/60",
  lead: "bg-slate-100 text-slate-600 dark:text-slate-400 ring-slate-200/60",
  registered: "bg-sky-50 text-sky-700 ring-sky-200/60",
  under_review: "bg-blue-50 text-blue-700 ring-blue-200/60",
  shortlisted: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  submitted: "bg-blue-50 text-blue-700 ring-blue-200/60",
  client_interview: "bg-sky-50 text-sky-700 ring-sky-200/60",
  offer: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  placed: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  alumni: "bg-slate-100 text-slate-500 dark:text-slate-400 ring-slate-200/60",
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
    <select
      defaultValue={currentStatus}
      onChange={handleChange}
      className={`rounded-ros-md border-0 ring-1 px-3 py-1.5 text-[13px] font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] cursor-pointer ${
        STATUS_STYLE[currentStatus] ?? "bg-slate-100 text-slate-700 dark:text-slate-300 ring-slate-200/60"
      }`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
