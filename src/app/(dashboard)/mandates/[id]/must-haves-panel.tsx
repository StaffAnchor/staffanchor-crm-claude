"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ListChecks, Check, Pencil, X, Plus } from "lucide-react";

function TagEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft("");
  }

  return (
    <div className="mb-3">
      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {items.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[12px] px-2.5 py-1"
          >
            {item}
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[12px] text-slate-400">None added yet.</span>}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={`Add a ${label.toLowerCase()} item...`}
          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[12px]"
        />
        <button
          onClick={add}
          className="rounded-lg border border-slate-300 px-2 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function MustHavesPanel({
  mandateId,
  initialMustHaves,
  initialGoodToHaves,
}: {
  mandateId: string;
  initialMustHaves: string[];
  initialGoodToHaves: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(initialMustHaves.length === 0 && initialGoodToHaves.length === 0);
  const [mustHaves, setMustHaves] = useState<string[]>(initialMustHaves);
  const [goodToHaves, setGoodToHaves] = useState<string[]>(initialGoodToHaves);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await supabase
      .from("mandates")
      .update({ must_haves: mustHaves, good_to_haves: goodToHaves })
      .eq("id", mandateId);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <ListChecks className="w-3.5 h-3.5 text-slate-400" /> Must haves / Good to haves
        </h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        Used by AI candidate matching below to score and explain fit against this mandate.
      </p>

      {editing ? (
        <>
          <TagEditor label="Must haves" items={mustHaves} onChange={setMustHaves} />
          <TagEditor label="Good to haves" items={goodToHaves} onChange={setGoodToHaves} />
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60 mt-1"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Must haves</p>
            <div className="flex flex-wrap gap-1.5">
              {mustHaves.map((item, i) => (
                <span key={i} className="rounded-full bg-red-50 text-red-700 text-[12px] px-2.5 py-1">
                  {item}
                </span>
              ))}
              {mustHaves.length === 0 && <span className="text-[12px] text-slate-400">None added.</span>}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Good to haves</p>
            <div className="flex flex-wrap gap-1.5">
              {goodToHaves.map((item, i) => (
                <span key={i} className="rounded-full bg-blue-50 text-blue-700 text-[12px] px-2.5 py-1">
                  {item}
                </span>
              ))}
              {goodToHaves.length === 0 && <span className="text-[12px] text-slate-400">None added.</span>}
            </div>
          </div>
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
