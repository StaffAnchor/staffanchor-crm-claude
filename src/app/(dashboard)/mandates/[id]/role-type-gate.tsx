"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RoleLevelSelect, RoleTypeSelect, useRoleClusters } from "@/components/role-type-fields";
import { LEVEL_OPTIONS, suggestFromTitle } from "@/lib/role-type";

// Matching needs to know what kind of job this is and at what level, and it will not guess. Until both are set on the
// mandate, this is shown instead of a ranking. A suggestion from the title is offered, and a person has to press it.
export default function RoleTypeGate({ mandateId, roleTitle, cluster, level }: { mandateId: string; roleTitle: string | null; cluster: string | null; level: string | null }) {
  const router = useRouter();
  const clusters = useRoleClusters();
  const hint = suggestFromTitle(roleTitle);
  const [c, setC] = useState(cluster ?? "");
  const [l, setL] = useState(level ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!c || !l) return setError("Choose both.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-type`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_cluster: c, seniority_band: l }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Couldn't save.");
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const hintCluster = clusters.find((x) => x.slug === hint.cluster)?.name;
  const hintLevel = LEVEL_OPTIONS.find((x) => x.value === hint.level)?.label.split(" (")[0];

  return (
    <div className="rounded-ros-xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900 dark:bg-amber-950/10">
      <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Say what kind of role this is, then I&apos;ll find the people</h3>
      <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300">
        Whether the hire is an individual seller or someone who leads a team changes who fits, so it is set on the mandate and never guessed.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-[12px] text-slate-500">
          Role type (what the hire will do) <span className="text-rose-600">*</span>
          <RoleTypeSelect value={c} onChange={setC} clusters={clusters} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
        </label>
        <label className="text-[12px] text-slate-500">
          Level <span className="text-rose-600">*</span>
          <RoleLevelSelect value={l} onChange={setL} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
        </label>
      </div>
      {(hint.cluster || hint.level) && (
        <p className="mt-2 text-[12px] text-slate-500">
          From the title &quot;{roleTitle}&quot;, it might be:{" "}
          <button type="button" onClick={() => { if (hint.cluster) setC(hint.cluster); if (hint.level) setL(hint.level); }} className="font-medium text-blue-600 hover:underline">
            {[hintCluster, hintLevel].filter(Boolean).join(", ")}
          </button>{" "}
          (press to use it, or choose your own).
        </p>
      )}
      {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}
      <button type="button" onClick={save} disabled={busy || !c || !l} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and find people
      </button>
    </div>
  );
}
