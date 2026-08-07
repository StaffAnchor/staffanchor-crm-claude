"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2 } from "lucide-react";

type Tranche = { label: string; split_pct: number; trigger: string };

const TRIGGER_LABEL: Record<string, string> = {
  on_placement: "On placement",
  "90_days_post_joining": "90 days post-joining",
  "180_days_post_joining": "180 days post-joining",
};

// Milestone/tranche billing per the business model: instead of one flat fee
// billed at placement, a mandate's fee can be split across placement / 90-day
// retention / a longer performance milestone. This template is the *plan*;
// the actual amounts (fn_create_fee_tranches(), see migration) get generated
// once a candidate on this mandate is actually marked placed, using the
// candidate's CTC and the client's fee_percentage.
export default function FeeSchedulePanel({ mandateId, initial }: { mandateId: string; initial: Tranche[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [tranches, setTranches] = useState<Tranche[]>(initial.length ? initial : [{ label: "Placement", split_pct: 100, trigger: "on_placement" }]);
  const [saving, setSaving] = useState(false);

  const total = tranches.reduce((sum, t) => sum + (Number(t.split_pct) || 0), 0);

  function update(i: number, patch: Partial<Tranche>) {
    setTranches((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  function addTranche() {
    setTranches((prev) => [...prev, { label: "", split_pct: 0, trigger: "90_days_post_joining" }]);
  }

  function removeTranche(i: number) {
    setTranches((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from("mandates").update({ fee_tranche_template: tranches }).eq("id", mandateId);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Fee schedule</h2>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
        How this mandate&apos;s placement fee splits across milestones. Applied automatically (against the
        candidate&apos;s CTC and the client&apos;s fee %) the moment a candidate here is marked placed.
      </p>
      <div className="space-y-2">
        {tranches.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_1fr_auto] gap-1.5 items-center">
            <input
              value={t.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label"
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[12.5px]"
            />
            <input
              type="number"
              value={t.split_pct}
              onChange={(e) => update(i, { split_pct: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[12.5px]"
            />
            <select
              value={t.trigger}
              onChange={(e) => update(i, { trigger: e.target.value })}
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[12.5px]"
            >
              {Object.entries(TRIGGER_LABEL).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
            <button onClick={() => removeTranche(i)} className="text-slate-400 hover:text-rose-600 p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <button onClick={addTranche} className="flex items-center gap-1 text-[12px] text-blue-600 hover:underline">
          <Plus className="w-3 h-3" /> Add tranche
        </button>
        <span className={`text-[12px] font-medium ${total === 100 ? "text-slate-400" : "text-amber-600"}`}>
          Total: {total}% {total !== 100 && "(should be 100)"}
        </span>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full mt-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-[13px] font-medium py-2"
      >
        {saving ? "Saving..." : "Save fee schedule"}
      </button>
    </div>
  );
}
