"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

// Scores everyone already in this role's pipeline against the role, so they sit in the same ranking as the matches.
export default function ScorePipelineButton({ mandateId, disabled }: { mandateId: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mandate-match-pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ text: j.error ?? "Scoring failed.", ok: false });
      else {
        setMsg({ text: `Scored ${j.scored} of ${j.consideredCount} in the pipeline${j.truncated ? " (more than the scoring cap)" : ""}.`, ok: true });
        router.refresh();
      }
    } catch {
      setMsg({ text: "Scoring failed. Try again.", ok: false });
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        title="Score every candidate already in this pipeline against this role"
        className="inline-flex items-center gap-1.5 rounded-ros-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-teal-500" />}
        {busy ? "Scoring…" : "Score the pipeline"}
      </button>
      {msg && <span className={`text-[12.5px] ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</span>}
    </span>
  );
}
