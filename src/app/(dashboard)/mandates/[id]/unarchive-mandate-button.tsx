"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArchiveRestore, Loader2 } from "lucide-react";

// Reverses ArchiveMandateButton -- restores status to whatever it was
// archived FROM (draft/open/on_hold/closed/filled), falling back to "open"
// for any archived mandate that predates this feature and has no
// archived_from_status recorded. Clears the archive metadata since it no
// longer applies once reactivated.
export default function UnarchiveMandateButton({
  mandateId,
  archivedFromStatus,
}: {
  mandateId: string;
  archivedFromStatus: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnarchive() {
    const restoredStatus = archivedFromStatus ?? "open";
    const confirmed = window.confirm(
      `Reactivate this mandate? It'll go back to "${restoredStatus.replace(/_/g, " ")}" and reappear in the active Mandates list.`
    );
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("mandates")
      .update({
        status: restoredStatus,
        archived_reason: null,
        archived_from_status: null,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", mandateId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleUnarchive}
        disabled={saving}
        className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
      >
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveRestore className="w-3 h-3" />}
        Reactivate mandate
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-[260px] text-right">{error}</p>}
    </div>
  );
}
