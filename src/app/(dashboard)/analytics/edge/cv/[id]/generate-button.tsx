"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Writes a CV draft from the candidate's answers and opens it. Nothing is sent to the candidate.
export default function GenerateButton({ briefId, hasDrafts, submitted }: { briefId: string; hasDrafts: boolean; submitted: boolean }) {
  const router = useRouter();
  const [polish, setPolish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    if (!submitted && !window.confirm("The candidate has not submitted the form yet, so the draft will be thin. Write it anyway?")) return;
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/cv-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ briefId, polish }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      return setErr(j.error ?? "Couldn't write the draft.");
    }
    router.push(`/analytics/edge/cv/${briefId}/doc/${j.id}`);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={go} disabled={busy} className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Writing the draft…" : hasDrafts ? "Write a new draft from the answers" : "Write the first draft"}</button>
        <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300"><input type="checkbox" checked={polish} onChange={(e) => setPolish(e.target.checked)} /> Polish the wording with AI (every figure is checked)</label>
      </div>
      {busy && <p className="text-xs text-slate-500">This can take up to half a minute.</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}
