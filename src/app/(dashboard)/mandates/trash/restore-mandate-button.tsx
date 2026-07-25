"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RotateCcw, Loader2 } from "lucide-react";

export default function RestoreMandateButton({ trashId, roleTitle }: { trashId: string; roleTitle: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    if (!window.confirm(`Restore "${roleTitle}"? Its candidate links come back too.`)) return;
    setRestoring(true);
    setError(null);
    const { data: mandateId, error } = await supabase.rpc("restore_mandate", { p_trash_id: trashId });
    if (error) {
      setError(error.message);
      setRestoring(false);
      return;
    }
    router.push(`/mandates/${mandateId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRestore}
        disabled={restoring}
        className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
      >
        {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
        Restore
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
