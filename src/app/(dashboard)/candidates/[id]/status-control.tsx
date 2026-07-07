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

const STATUS_STYLE: Record<string, string> = {
  awaiting_input: "bg-amber-50 text-amber-700 ring-amber-200",
  lead: "bg-slate-100 text-slate-600 ring-slate-200",
  registered: "bg-blue-50 text-blue-700 ring-blue-200",
  under_review: "bg-violet-50 text-violet-700 ring-violet-200",
  shortlisted: "bg-teal-50 text-teal-700 ring-teal-200",
  submitted: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  client_interview: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  offer: "bg-lime-50 text-lime-700 ring-lime-200",
  placed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  alumni: "bg-slate-100 text-slate-500 ring-slate-200",
  inactive: "bg-red-50 text-red-600 ring-red-200",
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
      className={`rounded-lg border-0 ring-1 px-3 py-1.5 text-[13px] font-medium ${
        STATUS_STYLE[currentStatus] ?? "bg-slate-100 text-slate-700 ring-slate-200"
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
