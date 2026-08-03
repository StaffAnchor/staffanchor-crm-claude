"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArchiveRestore, Loader2 } from "lucide-react";

// Reverses ArchiveMandateButton. Since archiving no longer overwrites
// status (is_archived is a separate flag -- see archive-mandate-button.tsx),
// reactivating never has to guess what status to restore: the real status
// (on_hold/closed/filled) was never touched, so this just un-hides it from
// the active Mandates list. If the underlying status also needs to change
// (e.g. the client actually wants to reopen a closed role), that's a
// separate, deliberate edit via "Update status" or Basic Details.
export default function UnarchiveMandateButton({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnarchive() {
    const confirmed = window.confirm("Reactivate this mandate? It'll reappear in the active Mandates list.");
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("mandates")
      .update({ is_archived: false, archived_reason: null, archived_at: null, archived_by: null })
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
