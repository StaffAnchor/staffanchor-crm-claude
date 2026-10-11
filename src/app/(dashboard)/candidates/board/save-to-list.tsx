"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ShortlistSummary } from "@/lib/shortlists";

// A small menu on every card: tick the shortlists this person belongs to, or start a new one.
export default function SaveToList({ candidateId, lists, memberOf }: { candidateId: string; lists: ShortlistSummary[]; memberOf: string[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<ShortlistSummary[]>(lists);
  const [member, setMember] = useState<Set<string>>(new Set(memberOf));
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const who = useRef<{ id: string | null; name: string | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function me() {
    if (who.current) return who.current;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let n: string | null = null;
    if (user) {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      n = (data?.full_name as string | null) ?? null;
    }
    who.current = { id: user?.id ?? null, name: n };
    return who.current;
  }

  async function toggle(listId: string) {
    setBusy(listId);
    setError(null);
    const supabase = createClient();
    const inList = member.has(listId);
    const { id, name: n } = await me();
    const res = inList
      ? await supabase.from("candidate_list_items").delete().eq("list_id", listId).eq("candidate_id", candidateId)
      : await supabase.from("candidate_list_items").insert({ list_id: listId, candidate_id: candidateId, added_by: id, added_by_name: n });
    if (res.error && res.error.code !== "23505") setError("Couldn't save. Try again.");
    else {
      setMember((prev) => {
        const next = new Set(prev);
        if (inList) next.delete(listId);
        else next.add(listId);
        return next;
      });
      setAll((prev) => prev.map((l) => (l.id === listId ? { ...l, n: Math.max(0, l.n + (inList ? -1 : 1)) } : l)));
      if (!inList) await supabase.from("candidate_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
    }
    setBusy(null);
  }

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setBusy("new");
    setError(null);
    const supabase = createClient();
    const { id, name: n } = await me();
    const { data, error: e1 } = await supabase.from("candidate_lists").insert({ name: clean, owner_id: id, owner_name: n }).select("id, name").single();
    if (e1 || !data) {
      setError("Couldn't create the list.");
      setBusy(null);
      return;
    }
    const { error: e2 } = await supabase.from("candidate_list_items").insert({ list_id: data.id, candidate_id: candidateId, added_by: id, added_by_name: n });
    if (e2) setError("List created, but couldn't add this person.");
    else {
      setMember((prev) => new Set(prev).add(data.id as string));
      setAll((prev) => [{ id: data.id as string, name: data.name as string, n: 1, owner_name: n }, ...prev]);
    }
    setName("");
    setBusy(null);
  }

  const saved = member.size > 0;
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition-colors ${saved ? "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800" : "text-slate-600 ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700"}`}
        aria-expanded={open}
      >
        {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />} {saved ? `Saved${member.size > 1 ? ` · ${member.size}` : ""}` : "Save"}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="px-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Save to a shortlist</p>
          <div className="max-h-48 overflow-y-auto">
            {all.length === 0 && <p className="px-1.5 py-2 text-[12px] text-slate-400">No shortlists yet. Make the first one below.</p>}
            {all.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                disabled={busy !== null}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-left text-[12.5px] hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${member.has(l.id) ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>
                    {busy === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : member.has(l.id) ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="truncate text-slate-800 dark:text-slate-200">{l.name}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{l.n}</span>
              </button>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="New shortlist name"
              maxLength={80}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
            />
            <button type="button" onClick={create} disabled={!name.trim() || busy !== null} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-50">
              {busy === "new" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Create
            </button>
          </div>
          {error && <p className="px-1.5 pt-1 text-[11.5px] text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
