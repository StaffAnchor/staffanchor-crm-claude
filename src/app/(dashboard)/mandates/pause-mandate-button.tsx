"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pause, Play, Loader2 } from "lucide-react";

const PAUSE_REASONS = [
  "Client paused the search",
  "Waiting on client feedback",
  "Budget or approval on hold",
  "No longer a priority for us",
  "Other",
];

// One-click pause / resume for a role straight from the Mandates table.
// "Paused" is the existing on_hold status, so everything that already
// ignores non-open roles keeps doing so: the public jobs listing and
// quick-apply, job alerts, matching and resurfacing, the sweeps, and Today.
// Nothing is deleted or archived; resuming puts the role back exactly as
// it was.
export default function PauseMandateButton({ mandateId, status, roleTitle }: { mandateId: string; status: string; roleTitle: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(PAUSE_REASONS[0]);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "open" && status !== "on_hold") return null;

  async function pause() {
    setBusy(true);
    setError(null);
    const { data } = await supabase.auth.getUser();
    const finalReason = reason === "Other" ? other.trim() || "Other" : reason;
    const { error: err } = await supabase
      .from("mandates")
      .update({ status: "on_hold", paused_reason: finalReason, paused_at: new Date().toISOString(), paused_by: data.user?.id ?? null })
      .eq("id", mandateId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function resume() {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("mandates")
      .update({ status: "open", paused_reason: null, paused_at: null, paused_by: null })
      .eq("id", mandateId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  if (status === "on_hold") {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          onClick={resume}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium px-2.5 py-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Resume
        </button>
        {error && <span className="text-[11px] text-red-600 max-w-[160px]">{error}</span>}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[12px] font-medium px-2.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <Pause className="w-3 h-3" /> Pause
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-md w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">Pause this role?</h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
              {roleTitle} will be hidden from the jobs site, stop taking applications and drop out of matching, alerts and Today. Nothing is deleted, and Resume brings it back.
            </p>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[13px] mb-2"
            >
              {PAUSE_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            {reason === "Other" && (
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="What's the reason?"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[13px] mb-2"
              />
            )}
            {error && <p className="text-[12px] text-red-600 mb-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setOpen(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={pause} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60">
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Pause role
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
