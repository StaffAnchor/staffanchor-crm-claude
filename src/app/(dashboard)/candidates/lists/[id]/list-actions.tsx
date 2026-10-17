"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row = { id: string; name: string; headline: string; city: string | null; experience: number | null; current_ctc: number | null; expected_ctc: number | null; notice: string | null; phone: string | null; has_email: boolean };

export default function ListActions({ listId, name, canEdit, mandates, rows }: { listId: string; name: string; canEdit: boolean; mandates: { id: string; role_title: string; city: string | null }[]; rows: Row[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(name);
  const [editing, setEditing] = useState(false);
  const [mandate, setMandate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function rename() {
    const clean = title.trim();
    if (!clean || clean === name) return setEditing(false);
    setBusy("rename");
    const supabase = createClient();
    const { error } = await supabase.from("candidate_lists").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", listId);
    setBusy(null);
    setEditing(false);
    setMessage(error ? "Couldn't rename." : "Renamed.");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete the shortlist "${name}"? The people stay in the database; only the list is removed.`)) return;
    setBusy("delete");
    const supabase = createClient();
    const { error } = await supabase.from("candidate_lists").delete().eq("id", listId);
    setBusy(null);
    if (error) return setMessage("Couldn't delete the list.");
    router.push("/candidates/lists");
  }

  async function addAll() {
    if (!mandate || rows.length === 0) return;
    if (!window.confirm(`Add all ${rows.length} people to this mandate's pipeline?`)) return;
    setBusy("mandate");
    setMessage(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let added = 0;
    let already = 0;
    let failed = 0;
    for (const r of rows) {
      const { error } = await supabase.from("candidate_mandate_links").insert({ candidate_id: r.id, mandate_id: mandate, added_by: user?.id ?? null, match_source: "shortlist", matched_at: new Date().toISOString() });
      if (!error) added++;
      else if (error.code === "23505") already++;
      else failed++;
    }
    setBusy(null);
    setMessage(`Added ${added}${already ? `, ${already} were already in the pipeline` : ""}${failed ? `, ${failed} couldn't be added` : ""}.`);
  }

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Name", "Headline", "City", "Experience (yrs)", "Current CTC (LPA)", "Expected CTC (LPA)", "Notice", "Phone", "Email on file"];
    const lines = [head.map(esc).join(",")].concat(rows.map((r) => [r.name, r.headline, r.city, r.experience, r.current_ctc, r.expected_ctc, r.notice, r.phone, r.has_email ? "yes" : "no"].map(esc).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "shortlist"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && rename()} maxLength={80} className="w-56 rounded-full border border-slate-300 px-3 py-1 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
            <button onClick={rename} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white">
              {busy === "rename" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save name
            </button>
          </>
        ) : (
          canEdit && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700">
              <Pencil className="h-3 w-3" /> Rename
            </button>
          )
        )}
        <button onClick={exportCsv} disabled={rows.length === 0} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:ring-slate-700">
          <Download className="h-3 w-3" /> Export CSV
        </button>
        {canEdit && (
          <button onClick={remove} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12.5px] font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50">
            {busy === "delete" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Delete list
          </button>
        )}
      </div>
      {mandates.length > 0 && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <select value={mandate} onChange={(e) => setMandate(e.target.value)} className="max-w-[240px] rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12.5px] dark:border-slate-700">
            <option value="">Add everyone to a mandate…</option>
            {mandates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.role_title}
                {m.city ? ` · ${m.city}` : ""}
              </option>
            ))}
          </select>
          <button onClick={addAll} disabled={!mandate || busy !== null} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
            {busy === "mandate" && <Loader2 className="h-3 w-3 animate-spin" />} Add all ({rows.length})
          </button>
        </div>
      )}
      {message && <p className="text-[12.5px] text-slate-600 dark:text-slate-300">{message}</p>}
    </div>
  );
}
