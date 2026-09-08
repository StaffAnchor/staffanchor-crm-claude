"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Check, X } from "lucide-react";

// Inline editable target -- lets an admin nudge a monthly placement target
// without leaving the page (e.g. client asks to raise Nov to 3 mid-quarter).
// Same "click to edit, save via RPC, router.refresh()" pattern as
// role-control.tsx / specialties-control.tsx.
export default function TargetEditor({
  monthStart,
  currentTarget,
}: {
  monthStart: string;
  currentTarget: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentTarget));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    setSaving(true);
    await supabase.rpc("admin_update_fy_target", { p_month_start: monthStart, p_target_placements: n });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-semibold tabular-nums hover:text-blue-600 dark:hover:text-blue-400"
        title="Click to edit target"
      >
        {currentTarget}
        <Pencil className="w-3 h-3 opacity-40" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="w-14 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-0.5 text-[12px] tabular-nums"
      />
      <button type="button" onClick={handleSave} disabled={saving} className="text-emerald-600 hover:text-emerald-700">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
