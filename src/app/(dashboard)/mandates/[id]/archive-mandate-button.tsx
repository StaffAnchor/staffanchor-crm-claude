"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Archive, Loader2 } from "lucide-react";

// The real lifecycle statuses this modal lets you set. "draft" is
// deliberately excluded -- you don't "close out" a mandate back to draft
// from here; that's an edge case for Basic Details, not this flow.
const STATUS_OPTIONS: { value: string; label: string; archivable: boolean }[] = [
  {
    value: "open",
    label: "Still open (e.g. more openings to fill)",
    archivable: false,
  },
  { value: "on_hold", label: "On hold", archivable: true },
  { value: "closed", label: "Closed (client withdrew / no longer hiring)", archivable: true },
  { value: "filled", label: "Filled", archivable: true },
];

const REASON_OPTIONS: Record<string, string[]> = {
  on_hold: ["Client paused the search", "Internal budget review", "Other"],
  closed: ["Client withdrew the role", "No longer hiring / budget cut", "Other"],
  filled: ["Filled through us", "Position filled elsewhere", "Other"],
};

// Archiving is a visibility flag layered ON TOP of the real status, not a
// status value itself (that was the bug: status="archived" threw away
// whether the mandate had actually been filled, closed, or put on hold,
// leaving only a free-text reason to guess from). This modal makes you
// settle the real outcome FIRST -- picking "Still open" is the explicit
// escape hatch for "we have more than one opening here and only some are
// filled, so this stays active" -- and only then offers to archive
// (hide from the active list) once the outcome is something other than
// open. Reactivating later (unarchive-mandate-button.tsx) never has to
// guess what to restore the status to, because status was never touched.
export default function ArchiveMandateButton({ mandateId, currentStatus }: { mandateId: string; currentStatus: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus === "draft" ? "open" : currentStatus);
  const [reason, setReason] = useState(REASON_OPTIONS[status]?.[0] ?? "");
  const [otherReason, setOtherReason] = useState("");
  const [shouldArchive, setShouldArchive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = STATUS_OPTIONS.find((o) => o.value === status) ?? STATUS_OPTIONS[0];
  const canArchive = selectedOption.archivable;

  function pickStatus(v: string) {
    setStatus(v);
    setReason(REASON_OPTIONS[v]?.[0] ?? "");
    setOtherReason("");
    const opt = STATUS_OPTIONS.find((o) => o.value === v);
    setShouldArchive(Boolean(opt?.archivable));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const archiving = canArchive && shouldArchive;
    const finalReason = reason === "Other" ? otherReason.trim() || "Other" : reason;
    const { data: userData } = archiving ? await supabase.auth.getUser() : { data: null };
    const { error: err } = await supabase
      .from("mandates")
      .update({
        status,
        is_archived: archiving,
        archived_reason: archiving ? finalReason : null,
        archived_at: archiving ? new Date().toISOString() : null,
        archived_by: archiving ? userData?.user?.id ?? null : null,
      })
      .eq("id", mandateId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Archive className="w-3 h-3" /> Update status
      </button>
      {error && !open && <p className="text-[11px] text-red-600 max-w-[260px] text-right">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-md w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">What's the real status now?</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
              Settle this first -- if there's more than one opening and only some are filled, pick "Still open" and
              nothing else changes.
            </p>

            <div className="space-y-1.5 mb-3">
              {STATUS_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] cursor-pointer transition-colors ${
                    status === o.value
                      ? "border-slate-400 bg-slate-50 dark:bg-slate-800/60"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <input type="radio" name="outcome-status" checked={status === o.value} onChange={() => pickStatus(o.value)} className="mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-300">{o.label}</span>
                </label>
              ))}
            </div>

            {canArchive && (
              <>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2"
                >
                  {(REASON_OPTIONS[status] ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {reason === "Other" && (
                  <input
                    value={otherReason}
                    onChange={(e) => setOtherReason(e.target.value)}
                    placeholder="What happened?"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2"
                  />
                )}
                <label className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-slate-300 mb-1">
                  <input type="checkbox" checked={shouldArchive} onChange={(e) => setShouldArchive(e.target.checked)} />
                  Also archive it (hide from the active Mandates list -- can be reactivated any time)
                </label>
              </>
            )}

            {error && <p className="text-[12px] text-red-600 mt-1 mb-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-[12px] font-medium text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
