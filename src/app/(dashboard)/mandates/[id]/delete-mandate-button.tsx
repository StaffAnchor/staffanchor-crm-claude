"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Loader2 } from "lucide-react";

export default function DeleteMandateButton({ mandateId, roleTitle }: { mandateId: string; roleTitle: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete the "${roleTitle}" mandate? This removes all candidate links, the shortlist link, and any assignments for this mandate. Candidate profiles and client portal access are not affected. This cannot be undone.`
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from("mandates").delete().eq("id", mandateId);
    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.push("/mandates");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
      >
        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
        Delete mandate
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-[260px] text-right">{error}</p>}
    </div>
  );
}
