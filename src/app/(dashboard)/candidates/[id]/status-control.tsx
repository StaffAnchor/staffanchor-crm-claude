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
    const status = e.target.value;
    await supabase.from("candidates").update({ status }).eq("id", candidateId);
    router.refresh();
  }

  return (
    <select
      defaultValue={currentStatus}
      onChange={handleChange}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}
