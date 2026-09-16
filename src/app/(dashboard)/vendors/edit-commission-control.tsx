"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, Pencil, X } from "lucide-react";

// Lets admin set the commission % StaffAnchor owes a vendor agency when
// their candidate closes -- shown back to the vendor on every mandate card
// in the vendor portal (get_my_vendor_mandates() reads this column, with a
// per-mandate override on mandate_assignments taking priority when set).
export default function EditCommissionControl({
  agencyId,
  currentValue,
}: {
  agencyId: string;
  currentValue: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentValue?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const parsed = value.trim() === "" ? null : Number(value);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 100)) {
      setError("Enter a number between 0 and 100.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("vendor_agencies")
      .update({ commission_percentage: parsed })
      .eq("id", agencyId);
    setSaving(false);
    if (updateError) {
      setError("Failed to save.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-[12px] text-slate-600 hover:text-teal-600 tabular-nums"
      >
        {currentValue !== null ? `${currentValue}%` : <span className="text-slate-300">Not set</span>}
        <Pencil className="w-3 h-3 text-slate-300" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        autoFocus
        type="number"
        min="0"
        max="100"
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-16 text-[12px] rounded-lg border border-slate-300 px-1.5 py-0.5"
        placeholder="%"
      />
      <button onClick={save} disabled={saving} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
        <X className="w-3.5 h-3.5" />
      </button>
      {error && <span className="text-[11px] text-red-600 ml-1">{error}</span>}
    </div>
  );
}
