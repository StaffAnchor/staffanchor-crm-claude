"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Globe, Check } from "lucide-react";

export default function PublicListingPanel({
  mandateId,
  initialShowClientName,
  initialPublicClientLabel,
  clientName,
}: {
  mandateId: string;
  initialShowClientName: boolean;
  initialPublicClientLabel: string | null;
  clientName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showClientName, setShowClientName] = useState(initialShowClientName);
  const [label, setLabel] = useState(initialPublicClientLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("mandates")
      .update({
        show_client_name: showClientName,
        public_client_label: showClientName ? null : label || null,
      })
      .eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-slate-400" /> Public listing (jobs.staffanchor.com)
      </h2>
      <p className="text-[12px] text-slate-400 mb-3">Controls what candidates see before applying.</p>

      <label className="flex items-start gap-2 text-[13px] text-slate-700 mb-2">
        <input type="checkbox" checked={!showClientName} onChange={(e) => setShowClientName(!e.target.checked)} className="mt-0.5" />
        Hide client name (&quot;{clientName}&quot;)
      </label>

      {!showClientName && (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder='e.g. "A leading Internet company"'
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] mb-2"
        />
      )}

      <p className="text-[11px] text-slate-400 mb-3">
        Candidates will see: <span className="font-medium text-slate-600">{showClientName ? clientName : label || "A confidential client"}</span>
      </p>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60"
      >
        {saved ? (
          <>
            <Check className="w-3.5 h-3.5" /> Saved
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
}
