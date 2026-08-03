"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Archive, Loader2 } from "lucide-react";

const REASON_OPTIONS = [
  "Client withdrew the role",
  "Position filled elsewhere",
  "No longer hiring / budget cut",
  "Other",
];

// Archive is deliberately NOT the same thing as Delete (delete-mandate-button.tsx
// / soft_delete_mandate) -- it's a reversible status change, not a removal.
// The mandate stays in place with every candidate link and history intact,
// it just moves out of the default Mandates list (see mandates/page.tsx's
// `.neq("status", "archived")`) and out of every open-mandate count/cron
// sweep, which already key off status === "open" specifically. Remembers
// the status it was archived FROM so Unarchive can restore it exactly
// (a draft stays a draft, an on_hold stays on_hold) instead of always
// resetting to "open".
export default function ArchiveMandateButton({
  mandateId,
  currentStatus,
}: {
  mandateId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASON_OPTIONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    const finalReason = reason === "Other" ? otherReason.trim() || "Other" : reason;
    setSaving(true);
    setError(null);
    const { data: userData } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("mandates")
      .update({
        status: "archived",
        archived_reason: finalReason,
        archived_from_status: currentStatus,
        archived_at: new Date().toISOString(),
        archived_by: userData.user?.id ?? null,
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
        <Archive className="w-3 h-3" /> Archive mandate
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-[260px] text-right">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-md w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Archive this mandate?</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
              It'll move out of the active Mandates list, but nothing is deleted -- candidate links and history stay
              intact, and it can be reactivated any time.
            </p>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2"
            >
              {REASON_OPTIONS.map((r) => (
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
                onClick={handleArchive}
                disabled={saving}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Archive className="w-3 h-3" />}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
