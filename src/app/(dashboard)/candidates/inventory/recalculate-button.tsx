"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

// The inventory is rebuilt every night. This does it now, for example after a bulk upload.
export default function RecalculateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/inventory/refresh", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Updated (${d.tags} role records).` : d.error ?? "Couldn't update.");
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
      <button type="button" onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalculate now
      </button>
    </div>
  );
}
