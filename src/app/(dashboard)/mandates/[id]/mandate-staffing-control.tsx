"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, X, Plus } from "lucide-react";

type Person = { id: string; full_name: string | null; email: string; role: string };

// Single source of truth for "who's on this mandate" -- internal-only,
// never shown on any client- or candidate-facing surface (jobs.staffanchor.com,
// client portal, client shortlist link). This replaces the two separate
// controls that used to exist (a single-owner dropdown up here, plus a
// "Staffed on this mandate" panel further down the page that quietly wrote
// to a completely different table) with one compact, always-in-sync place:
// every add/remove goes through mandate_assignments (assign_mandate_staff /
// direct delete), which already drives recruiter_inbox routing and the
// Vendor Portal, and already fires an in-app notification to whoever's
// added. This component additionally fires an email to that person.
export default function MandateStaffingControl({
  mandateId,
  initialAssigned,
  allProfiles,
}: {
  mandateId: string;
  initialAssigned: Person[];
  allProfiles: Person[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [assigned, setAssigned] = useState(initialAssigned);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const assignedIds = new Set(assigned.map((a) => a.id));
  const candidates = allProfiles.filter((p) => !assignedIds.has(p.id));

  async function notifyByEmail(personId: string) {
    // Best-effort -- the in-app notification (fired server-side by
    // assign_mandate_staff itself) is the reliable part; email is a nice-to-have
    // on top, so a failure here shouldn't block or roll back the assignment.
    fetch("/api/notify-mandate-staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mandateId, freelancerId: personId }),
    }).catch(() => {});
  }

  async function handleAdd() {
    if (!pickerValue) return;
    setBusyId(pickerValue);
    setError("");
    const { error: err } = await supabase.rpc("assign_mandate_staff", {
      p_mandate_id: mandateId,
      p_freelancer_id: pickerValue,
    });
    setBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    const person = allProfiles.find((p) => p.id === pickerValue);
    if (person) {
      setAssigned((cur) => [...cur, person]);
      notifyByEmail(person.id);
    }
    setPickerValue("");
    setPickerOpen(false);
    router.refresh();
  }

  async function handleRemove(personId: string) {
    if (assigned.length <= 1) {
      setError("At least one recruiter or vendor must stay assigned -- add a replacement before removing this one.");
      return;
    }
    setError("");
    const prev = assigned;
    setBusyId(personId);
    setAssigned((cur) => cur.filter((p) => p.id !== personId));
    const { error: err } = await supabase
      .from("mandate_assignments")
      .delete()
      .eq("mandate_id", mandateId)
      .eq("freelancer_id", personId);
    setBusyId(null);
    if (err) {
      setAssigned(prev);
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-slate-400">Recruiter / Vendor:</span>
        {assigned.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-slate-700 dark:text-slate-300"
          >
            {p.full_name ?? p.email}
            {p.role === "freelancer" && <span className="text-[10px] uppercase text-slate-400">vendor</span>}
            {busyId === p.id ? (
              <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
            ) : (
              <button
                type="button"
                onClick={() => handleRemove(p.id)}
                className="text-slate-400 hover:text-red-600"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {pickerOpen ? (
          <span className="inline-flex items-center gap-1">
            <select
              autoFocus
              value={pickerValue}
              onChange={(e) => setPickerValue(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-0.5 text-[12px] text-slate-700 dark:text-slate-300"
            >
              <option value="">Select...</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.full_name ?? p.email) + (p.role === "freelancer" ? " (vendor)" : "")}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!pickerValue || busyId !== null}
              className="rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium px-2 py-0.5 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerOpen(false);
                setPickerValue("");
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-[11px]"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 px-2 py-0.5 text-[11.5px]"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}
