"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// Scores this person against the open roles right now (the same check as the Roles tab), then refreshes the page.
export default function CheckRolesButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/suggested-roles/check`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Couldn't check the roles. Try again.");
      else if ((d.checked ?? 0) + (d.reused ?? 0) === 0) setMsg("No open role could be checked yet.");
      else router.refresh();
    } catch {
      setMsg("Couldn't check the roles. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-1">
      <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-teal-300 px-2.5 py-0.5 text-[12px] font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/30">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />} {busy ? "Checking…" : "Check against open roles"}
      </button>
      {msg && <p className="mt-1 text-[11.5px] text-amber-700">{msg}</p>}
    </div>
  );
}
