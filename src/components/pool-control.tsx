"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Star, X } from "lucide-react";
import { POOL_TAGS, POOL_TIERS, POOL_TIER_HELP, POOL_TIER_LABEL, POOL_TIER_PILL, reasonRequired, type PoolEntry, type PoolTier } from "@/lib/talent-pool";

// The one control for the Talent Pool: shows where someone stands (or "Add to pool") and opens a small
// panel to choose the tier, tick what makes them good, and say why. Used on the bench, the profile and the pool.
export default function PoolControl({
  candidateId,
  entry,
  compact = false,
  className = "",
}: {
  candidateId: string;
  entry: PoolEntry | null;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<PoolTier>(entry?.tier ?? "strong");
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/talent-pool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, tier, reason, tags }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Couldn't save.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/talent-pool", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId }) });
      if (!res.ok) {
        setError("Couldn't remove.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      {entry ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={entry.reason ? `${POOL_TIER_LABEL[entry.tier]}: ${entry.reason}` : POOL_TIER_LABEL[entry.tier]}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${POOL_TIER_PILL[entry.tier]}`}
        >
          <Star className="h-3 w-3" /> {POOL_TIER_LABEL[entry.tier]}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title="Add this person to the Talent Pool"
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 ${
            compact ? "px-2.5 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12px]"
          }`}
        >
          <Star className="h-3.5 w-3.5" /> Add to pool
        </button>
      )}

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-80 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{entry ? "Talent Pool" : "Add to Talent Pool"}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1.5">
            {POOL_TIERS.map((t) => (
              <label key={t} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 ${tier === t ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                <input type="radio" name={`tier-${candidateId}`} checked={tier === t} onChange={() => setTier(t)} className="mt-0.5" />
                <span>
                  <span className="block text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{POOL_TIER_LABEL[t]}</span>
                  <span className="block text-[11.5px] text-slate-500">{POOL_TIER_HELP[t]}</span>
                </span>
              </label>
            ))}
          </div>

          <p className="mb-1 mt-3 text-[12px] font-semibold text-slate-700 dark:text-slate-200">What makes them good</p>
          <div className="flex flex-wrap gap-1.5">
            {POOL_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                aria-pressed={tags.includes(t)}
                className={`rounded-full border px-2 py-0.5 text-[11.5px] ${
                  tags.includes(t) ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {tags.includes(t) && <Check className="mr-0.5 inline h-3 w-3" />}
                {t}
              </button>
            ))}
          </div>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={reasonRequired(tier) ? "Why? e.g. Hit 120% quota 3 years running selling to BFSI" : "Optional note"}
            className="mt-3 w-full resize-y rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
          />
          {error && <p className="mt-1.5 text-[12px] text-rose-600">{error}</p>}

          <div className="mt-3 flex items-center justify-between gap-2">
            {entry ? (
              <button type="button" onClick={remove} disabled={busy} className="text-[12px] font-medium text-rose-600 hover:underline disabled:opacity-50">
                Remove from pool
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {entry ? "Save" : "Add to pool"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
