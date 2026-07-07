"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText, Check, Pencil } from "lucide-react";

export default function JobDescriptionPanel({
  mandateId,
  initialDescription,
}: {
  mandateId: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(!initialDescription);
  const [value, setValue] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase.from("mandates").update({ job_description: value || null }).eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> Job description
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[12px] text-slate-400 mb-3">Shown to candidates on the public job listing.</p>

      {editing ? (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={8}
            placeholder="Responsibilities, requirements, what a strong candidate looks like..."
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] resize-y mb-2"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      ) : (
        <div className="text-[13px] text-slate-700 whitespace-pre-wrap">
          {value || <span className="text-slate-400">No description yet.</span>}
        </div>
      )}

      {saved && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600 mt-2">
          <Check className="w-3 h-3" /> Saved
        </p>
      )}
    </div>
  );
}
