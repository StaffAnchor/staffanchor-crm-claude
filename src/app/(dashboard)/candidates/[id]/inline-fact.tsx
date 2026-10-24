"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Field = { key: "notice_period" | "current_fixed_ctc" | "expected_fixed_ctc"; label: string; kind: "text" | "lakhs"; value: string | number | null };

// A headline fact you can fix on the spot: click, type, press Enter. Notice period is text; CTC is in lakhs per year.
export default function InlineFact({ candidateId, label, icon, fields, display }: { candidateId: string; label: string; icon: ReactNode; fields: Field[]; display: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value == null ? "" : String(f.value)])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const patch: Record<string, string | number | null> = {};
    for (const f of fields) {
      const raw = (vals[f.key] ?? "").trim();
      if (f.kind === "lakhs") {
        if (raw === "") patch[f.key] = null;
        else {
          const n = Number(raw.replace(/[^\d.]/g, ""));
          if (!Number.isFinite(n) || n < 0 || n > 500) return setErr("Enter lakhs per year, for example 18.5");
          patch[f.key] = n;
        }
      } else patch[f.key] = raw === "" ? null : raw.slice(0, 60);
    }
    setBusy(true);
    setErr(null);
    const { error } = await createClient().from("candidates").update(patch).eq("id", candidateId);
    setBusy(false);
    if (error) return setErr("Could not save. Try again.");
    setEditing(false);
    router.refresh();
  }

  const input = "w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] dark:border-slate-600 dark:bg-slate-900";
  return (
    <div className="min-w-0 flex-1 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">
        <span className="text-slate-400">{icon}</span>
        {label}
      </p>
      {editing ? (
        <form
          className="mt-1.5 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {fields.map((f, i) => (
            <input
              key={f.key}
              autoFocus={i === 0}
              className={f.kind === "text" ? "w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] dark:border-slate-600 dark:bg-slate-900" : input}
              placeholder={f.kind === "lakhs" ? (f.key === "current_fixed_ctc" ? "Now, L" : "Expected, L") : "e.g. 30 days"}
              value={vals[f.key] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
            />
          ))}
          <button type="submit" disabled={busy} className="rounded-md bg-teal-600 px-2.5 py-1 text-[12.5px] font-semibold text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-[12.5px] text-slate-500">
            Cancel
          </button>
          {err && <span className="basis-full text-[12px] text-rose-600">{err}</span>}
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="group mt-0.5 flex items-center gap-1.5 text-left" title="Click to edit">
          {display ? (
            <span className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{display}</span>
          ) : (
            <span className="text-[14px] font-medium text-amber-700 dark:text-amber-300">Add it</span>
          )}
          <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
        </button>
      )}
    </div>
  );
}
