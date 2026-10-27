"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ShortlistSummary } from "@/lib/shortlists";

const MAX_SAVE = 300;
const CHUNK = 100;

// Keeps a set of people as a shortlist so it survives closing the page: either a new list, named after the
// role and the date, or added into one that already exists. The requirements it was made with are saved in
// the list's description.
export default function SaveShortlist({
  ids,
  label,
  defaultName,
  description,
  lists,
}: {
  ids: string[];
  label: string;
  defaultName: string;
  description: string;
  lists: ShortlistSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; name: string; added: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const count = Math.min(ids.length, MAX_SAVE);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function toggle() {
    setOpen((v) => !v);
    setDone(null);
    setError(null);
    setName(defaultName);
  }

  async function save() {
    if (count === 0 || busy) return;
    const clean = name.trim();
    if (target === "new" && !clean) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let who: string | null = null;
    if (user) {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      who = (data?.full_name as string | null) ?? null;
    }

    let listId = target;
    let listName = lists.find((l) => l.id === target)?.name ?? clean;
    if (target === "new") {
      const { data, error: e1 } = await supabase
        .from("candidate_lists")
        .insert({ name: clean.slice(0, 80), description: description.slice(0, 600), owner_id: user?.id ?? null, owner_name: who })
        .select("id, name")
        .single();
      if (e1 || !data) {
        setError("Couldn't create the shortlist. Try again.");
        setBusy(false);
        return;
      }
      listId = data.id as string;
      listName = data.name as string;
    }

    const rows = ids.slice(0, MAX_SAVE).map((candidate_id) => ({ list_id: listId, candidate_id, added_by: user?.id ?? null, added_by_name: who }));
    let failed = false;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: e2 } = await supabase.from("candidate_list_items").upsert(rows.slice(i, i + CHUNK), { onConflict: "list_id,candidate_id", ignoreDuplicates: true });
      if (e2) {
        failed = true;
        break;
      }
    }
    if (!failed) await supabase.from("candidate_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
    if (failed) setError("The shortlist was created but not every person could be added. Open it to check.");
    setDone({ id: listId, name: listName, added: rows.length });
    setBusy(false);
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        disabled={ids.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 dark:border-teal-700 px-3 py-1.5 text-[12.5px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 disabled:opacity-50"
      >
        <Bookmark className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {done ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Saved {done.added} to &quot;{done.name}&quot;
              </p>
              {error && <p className="text-[12px] text-amber-700">{error}</p>}
              <Link href={`/candidates/lists/${done.id}`} className="text-[12.5px] text-teal-600 hover:underline">
                Open the shortlist
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[12.5px] text-slate-600 dark:text-slate-300">
                Save <span className="font-semibold">{count}</span> {count === 1 ? "person" : "people"} as a shortlist{ids.length > MAX_SAVE ? ` (the first ${MAX_SAVE})` : ""}.
              </p>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900">
                <option value="new">A new shortlist</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    Add to: {l.name} ({l.n})
                  </option>
                ))}
              </select>
              {target === "new" && (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Shortlist name"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
                />
              )}
              <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">{description}</p>
              {error && <p className="text-[12px] text-rose-600">{error}</p>}
              <button
                type="button"
                onClick={save}
                disabled={busy || count === 0 || (target === "new" && !name.trim())}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />} Save shortlist
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
