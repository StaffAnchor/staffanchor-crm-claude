"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil } from "lucide-react";
import { ProfileGroupBadge } from "../profile-group-badge";
import { GROUP_LABEL, SUBGROUPS, type ProfileGroup } from "@/lib/profile-groups";

// Shows which group this profile sits in and why, and lets a recruiter correct it. A manual choice is
// kept from then on; "Back to automatic" returns it to the CV-based group.
export default function ProfileGroupControl({
  candidateId,
  group,
  subgroup,
  also,
  reason,
  needsReview,
  locked,
}: {
  candidateId: string;
  group: string | null;
  subgroup: string | null;
  also: string | null;
  reason: string | null;
  needsReview: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState<string>(group && group !== "unclear" ? group : "b2b_sales");
  const [s, setS] = useState<string>(subgroup ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/profile-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, ...payload }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error ?? "Couldn't save.");
      else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-start gap-2 text-[12px]">
      <ProfileGroupBadge group={group} subgroup={subgroup} also={also} needsReview={needsReview} reason={reason} />
      {reason && <span className="max-w-[420px] text-[11.5px] text-slate-500 dark:text-slate-400">{reason}{locked ? " (kept as set)" : ""}</span>}
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-blue-600 hover:underline">
        <Pencil className="h-3 w-3" /> Change group
      </button>
      {open && (
        <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 dark:border-slate-700 dark:bg-slate-800/40">
          <select value={g} onChange={(e) => setG(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-600 dark:bg-slate-900">
            {(["b2b_sales", "b2c_sales", "non_sales"] as ProfileGroup[]).map((x) => (
              <option key={x} value={x}>
                {GROUP_LABEL[x]}
              </option>
            ))}
          </select>
          {g === "non_sales" && (
            <select value={s} onChange={(e) => setS(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-600 dark:bg-slate-900">
              <option value="">Other / unspecified</option>
              {SUBGROUPS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => send({ group: g, subgroup: g === "non_sales" ? s || null : null })} disabled={busy} className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-blue-500 disabled:opacity-60">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </button>
          {locked && (
            <button onClick={() => send({ reset: true })} disabled={busy} className="text-[12px] font-medium text-slate-600 hover:underline dark:text-slate-300">
              Back to automatic
            </button>
          )}
          {error && <span className="text-rose-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
