"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AlsoRoleTypes from "@/components/also-role-types";
import { useRoleClusters } from "@/components/role-type-fields";

// "Also count these role types": widen a search without changing what the mandate is. Saves on every change, and the
// ranking above reorders straight away.
export default function AlsoTypesBar({ mandateId, main, initial }: { mandateId: string; main: string; initial: string[] }) {
  const router = useRouter();
  const clusters = useRoleClusters();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next: string[]) {
    const before = value;
    setValue(next);
    setBusy(true);
    const res = await fetch(`/api/mandates/${mandateId}/role-type`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ also_clusters: next }) });
    setBusy(false);
    if (!res.ok) setValue(before);
    else router.refresh();
  }

  return (
    <div className="rounded-ros-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">Also count these role types as a full fit</p>
      <AlsoRoleTypes value={value} onChange={change} clusters={clusters} main={main} disabled={busy} />
      {value.length === 0 && <p className="mt-1.5 text-xs text-slate-500">Optional. For example, an Account Executive role that would also take a Business Development person.</p>}
    </div>
  );
}
