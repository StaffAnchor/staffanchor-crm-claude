"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Loader2 } from "lucide-react";

export default function DeleteCandidateButton({ candidateId, candidateName }: { candidateId: string; candidateName: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(`Delete ${candidateName}'s profile? This cannot be undone.`);
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
    if (error) {
      setError(error.message);
      setDeleting(false);
      return;
    }
    router.push("/candidates");
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
        Delete profile
      </button>
      {error && <p className="text-[11px] text-red-600 max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
