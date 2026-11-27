"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Bookmark, X } from "lucide-react";

// Searches and filters you repeat, saved by name in this browser.
const KEY = "sa_people_views_v1";
type View = { name: string; query: string };

export default function SavedViews() {
  const params = useSearchParams();
  const current = new URLSearchParams(params.toString());
  current.delete("page");
  const query = current.toString();
  const [views, setViews] = useState<View[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(v)) setViews(v.filter((x) => x && typeof x.name === "string" && typeof x.query === "string"));
    } catch {
      /* nothing saved */
    }
  }, []);

  function store(next: View[]) {
    setViews(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private window */
    }
  }

  function save() {
    const n = name.trim();
    if (!n || !query) return;
    store([...views.filter((v) => v.name !== n), { name: n, query }]);
    setName("");
    setNaming(false);
  }

  const already = views.some((v) => v.query === query);
  if (views.length === 0 && !query) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.length > 0 && <span className="text-[12px] text-slate-500">Saved:</span>}
      {views.map((v) => (
        <span key={v.name} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px] ${v.query === query ? "border-teal-300 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"}`}>
          <Link href={`/candidates?${v.query}`}>{v.name}</Link>
          <button type="button" aria-label={`Remove saved view ${v.name}`} onClick={() => store(views.filter((x) => x.name !== v.name))} className="text-slate-400 hover:text-rose-600">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {query && !already && !naming && (
        <button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:underline">
          <Bookmark className="h-3.5 w-3.5" /> Save this view
        </button>
      )}
      {naming && (
        <span className="inline-flex items-center gap-1.5">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Name this view" className="rounded-lg border border-slate-200 px-2 py-1 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
          <button type="button" onClick={save} className="text-[13px] font-semibold text-teal-700">Save</button>
          <button type="button" onClick={() => setNaming(false)} className="text-[13px] text-slate-500">Cancel</button>
        </span>
      )}
    </div>
  );
}
