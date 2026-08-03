"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ClientInfoPanel({
  clientId,
  initialIndustry,
  initialHqCity,
  initialWebsite,
  initialNotes,
  initialOwnerId,
  initialFeePercentage,
  ownerOptions,
}: {
  clientId: string;
  initialIndustry: string | null;
  initialHqCity: string | null;
  initialWebsite: string | null;
  initialNotes: string | null;
  initialOwnerId?: string | null;
  // Feeds the Morning Briefing's billing forecast (get_my_morning_briefing)
  // -- defaults to 8.33% (one month's CTC, the standard Indian staffing
  // rate) at the DB level for every client, editable here per client since
  // negotiated rates vary.
  initialFeePercentage?: number | null;
  ownerOptions?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [industry, setIndustry] = useState(initialIndustry ?? "");
  const [hqCity, setHqCity] = useState(initialHqCity ?? "");
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [ownerId, setOwnerId] = useState(initialOwnerId ?? "");
  const [feePercentage, setFeePercentage] = useState(String(initialFeePercentage ?? 8.33));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerLabel = ownerOptions?.find((o) => o.id === initialOwnerId)?.label;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const parsedFee = parseFloat(feePercentage);
    if (feePercentage.trim() && (isNaN(parsedFee) || parsedFee < 0 || parsedFee > 100)) {
      setSaving(false);
      setError("Fee % must be a number between 0 and 100.");
      return;
    }
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        industry: industry.trim() || null,
        hq_city: hqCity.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
        owner_id: ownerId || null,
        fee_percentage: feePercentage.trim() ? parsedFee : 8.33,
      })
      .eq("id", clientId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Client details</h2>
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 text-[12px]">Owner (Partner)</dt>
            <dd className="text-slate-700 dark:text-slate-300 text-right">{ownerLabel || "Unassigned"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 text-[12px]">Industry</dt>
            <dd className="text-slate-700 dark:text-slate-300 text-right">{initialIndustry || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 text-[12px]">HQ city</dt>
            <dd className="text-slate-700 dark:text-slate-300 text-right">{initialHqCity || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 text-[12px]">Website</dt>
            <dd className="text-slate-700 dark:text-slate-300 text-right truncate max-w-[180px]">
              {initialWebsite ? (
                <a href={initialWebsite} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {initialWebsite}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-400 text-[12px]">Placement fee</dt>
            <dd className="text-slate-700 dark:text-slate-300 text-right">{(initialFeePercentage ?? 8.33)}% of CTC</dd>
          </div>
          {initialNotes && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <dt className="text-slate-400 text-[12px] mb-1">Notes</dt>
              <dd className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{initialNotes}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Edit client details</h2>
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Owner (Partner)</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="">Unassigned</option>
            {(ownerOptions ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Industry</label>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">HQ city</label>
          <input
            value={hqCity}
            onChange={(e) => setHqCity(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Website</label>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
            Placement fee (% of candidate CTC)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={feePercentage}
            onChange={(e) => setFeePercentage(e.target.value)}
            placeholder="8.33"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Drives the Morning Briefing&apos;s billing forecast. Defaults to 8.33% (one month&apos;s CTC) if left blank.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium px-3 py-2"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="rounded-lg border border-slate-300 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-sm font-medium px-3 py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
