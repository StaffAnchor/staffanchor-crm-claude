"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, PhoneCall, Sparkles } from "lucide-react";
import { POOL_TIERS, POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import type { Applied, Debrief } from "@/lib/debrief";

export type PastDebrief = { id: string; created_at: string; author: string | null; raw_note: string; summary: string | null };

// "After the call": rough notes in, everything else done by the system. A tier button is optional; without it
// the note's own verdict is used when it is clear.
export default function AfterCallCard({ candidateId, history }: { candidateId: string; history: PastDebrief[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [tier, setTier] = useState<PoolTier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ debrief: Debrief; applied: Applied } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/debrief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, tier }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setError(d.error ?? "Something went wrong. Nothing was saved.");
        return;
      }
      setResult({ debrief: d.debrief, applied: d.applied });
      setNote("");
      setTier(null);
      router.refresh();
    } catch {
      setError("Network error. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-emerald-600" />
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">After the call</h3>
        <span className="text-[12px] text-slate-400">Write it like a text to a colleague. We do the rest.</span>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder="e.g. Spoke 20 mins. Sold ERP to mid-market, closes 25-30L deals, beat quota 3 years. Very sharp, great communicator. Notice 30 days, wants 45 LPA, open to Pune. Worried he moved twice in 2 years."
        className="w-full resize-y rounded-ros-md border border-slate-300 bg-white px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-slate-500">Your verdict (optional):</span>
        {POOL_TIERS.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tier === t}
            onClick={() => setTier(tier === t ? null : t)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium ${tier === t ? "border-amber-500 bg-amber-100 text-amber-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {POOL_TIER_LABEL[t]}
          </button>
        ))}
        <button type="button" onClick={submit} disabled={busy || note.trim().length < 8} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {busy ? "Reading your note…" : "Record the call"}
        </button>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}

      {result && (
        <div className="mt-3 space-y-2 rounded-ros-lg border border-emerald-200 bg-emerald-50/60 p-3 text-[12.5px] dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300">
            <Check className="h-4 w-4" /> Recorded. Here is what the system did:
          </p>
          <p className="text-slate-700 dark:text-slate-200">{result.debrief.summary}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-200">
            {result.applied.tier && (
              <li>
                Talent Pool: <span className="font-semibold">{POOL_TIER_LABEL[result.applied.tier]}</span> ({result.applied.tierSource === "recruiter" ? "your verdict" : "from your note"})
              </li>
            )}
            {result.applied.passNoted && <li>Your note says not suitable, so they were not added to the pool.</li>}
            {!result.applied.tier && !result.applied.passNoted && <li>No clear verdict in the note, so the pool is unchanged. Pick a verdict above next time if you want them added.</li>}
            {result.applied.filled.map((f) => (
              <li key={f.field}>
                Filled in {f.label}: <span className="font-semibold">{f.value}</span>
              </li>
            ))}
            {result.applied.ratingsSaved && <li>Call ratings saved from your note.</li>}
            <li>Call logged in the activity history. The candidate brief and the role matches are being refreshed.</li>
          </ul>
          {result.applied.conflicts.length > 0 && (
            <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Differs from the profile (left unchanged, please check):{" "}
                {result.applied.conflicts.map((c) => `${c.label}: note says ${c.note}, profile has ${c.profile}`).join("; ")}.
              </span>
            </p>
          )}
          {result.debrief.concerns.length > 0 && <p className="text-slate-600 dark:text-slate-300">Concerns noted: {result.debrief.concerns.join("; ")}.</p>}
          {result.debrief.follow_up.note && <p className="text-slate-600 dark:text-slate-300">Follow-up: {result.debrief.follow_up.note}{result.debrief.follow_up.when ? ` (${result.debrief.follow_up.when})` : ""}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Earlier calls</p>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-ros-md bg-slate-50 px-3 py-2 text-[12.5px] dark:bg-slate-800/50">
                <p className="text-[11.5px] text-slate-400">
                  {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {h.author ? ` · ${h.author}` : ""}
                </p>
                <p className="text-slate-700 dark:text-slate-200">{h.summary ?? h.raw_note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
