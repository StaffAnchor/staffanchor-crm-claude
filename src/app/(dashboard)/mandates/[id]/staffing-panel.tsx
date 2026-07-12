"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Users, X } from "lucide-react";

type StaffedPerson = { id: string; full_name: string | null; email: string; role: string };

// Mandate staffing: who's assigned to work this mandate (routes
// recruiter_inbox tasks, and -- for freelancer/vendor accounts -- controls
// what shows up in their restricted Vendor Portal). One mandate can have
// multiple people staffed; every branch that reads mandate_assignments
// (sweep_recruiter_inbox, get_my_vendor_mandates, RLS scoping) already
// supports that.
export default function StaffingPanel({
  mandateId,
  initialAssigned,
  allProfiles,
}: {
  mandateId: string;
  initialAssigned: StaffedPerson[];
  allProfiles: StaffedPerson[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [assigned, setAssigned] = useState(initialAssigned);
  const [pickerValue, setPickerValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const assignedIds = new Set(assigned.map((a) => a.id));
  const candidates = allProfiles.filter((p) => !assignedIds.has(p.id));

  async function handleAssign() {
    if (!pickerValue) return;
    setSaving(true);
    setError("");
    const { error } = await supabase.rpc("assign_mandate_staff", {
      p_mandate_id: mandateId,
      p_freelancer_id: pickerValue,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    const person = allProfiles.find((p) => p.id === pickerValue);
    if (person) setAssigned((cur) => [...cur, person]);
    setPickerValue("");
    router.refresh();
  }

  async function handleRemove(personId: string) {
    const prev = assigned;
    setAssigned((cur) => cur.filter((p) => p.id !== personId));
    const { error } = await supabase
      .from("mandate_assignments")
      .delete()
      .eq("mandate_id", mandateId)
      .eq("freelancer_id", personId);
    if (error) {
      setAssigned(prev);
      setError(error.message);
    }
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-3">
        <Users className="w-4 h-4 text-slate-400" /> Staffed on this mandate
      </h3>

      {assigned.length === 0 ? (
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Nobody's staffed yet -- Priority Actions for this mandate stay unassigned/team-wide until someone is.
        </p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {assigned.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="text-[13px] text-slate-800 dark:text-slate-200 truncate">{p.full_name ?? p.email}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{p.role}</p>
              </div>
              <button onClick={() => handleRemove(p.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-[11px] text-red-600 mb-2">{error}</p>}

      <div className="flex items-center gap-2">
        <select
          value={pickerValue}
          onChange={(e) => setPickerValue(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px]"
        >
          <option value="">Add recruiter or vendor...</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.full_name ?? p.email) + (p.role === "freelancer" ? " (vendor)" : "")}
            </option>
          ))}
        </select>
        <button
          onClick={handleAssign}
          disabled={!pickerValue || saving}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  );
}
