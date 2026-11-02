"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PhoneIncoming, Search } from "lucide-react";

type Hit = { id: string; full_name: string | null; phone: string | null; current_job_title: string | null; current_employer: string | null; last_outcome: string | null };

const OUTCOME: Record<string, string> = { reached: "Spoke", no_answer: "No answer", call_later: "Call back", not_interested: "Not interested", wrong_number: "Wrong number" };
const shown = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p ?? "No number";
};

// Someone rang back on a phone that is not connected to the CRM: type their number (or name) from any page, pick them, and
// the call form opens with their details.
export default function CallerLookup() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 3) {
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/calls/lookup?q=${encodeURIComponent(text.trim())}`);
      const d = (await r.json()) as { people?: Hit[] };
      if (mine === seq.current) setHits(d.people ?? []);
    } catch {
      if (mine === seq.current) setHits([]);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="ros-focusable flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/50" aria-label="Find a caller by number" aria-expanded={open} title="Someone rang? Find them by number or name">
        <PhoneIncoming className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Caller</span>
      </button>
      {open && (
        <div className="ros-glass absolute right-0 z-40 mt-1.5 w-[320px] max-w-[92vw] rounded-ros-lg border p-2 shadow-ros-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => void search(e.target.value)} placeholder="Their number or name" inputMode="search" className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-[13px] text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
          <p className="mt-1 px-1 text-[11px] text-slate-400">Any part of the number works, at least 5 digits.</p>
          {busy && <p className="px-1 py-2 text-[12px] text-slate-400">Searching…</p>}
          {!busy && hits !== null && hits.length === 0 && <p className="px-1 py-2 text-[12.5px] text-slate-500">No profile with that number or name.</p>}
          {hits && hits.length > 0 && (
            <ul className="mt-1 max-h-72 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id}>
                  <Link href={`/candidates/complete?sub=priority&list=pay&open=${h.id}`} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <span className="block truncate text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{h.full_name ?? "Unnamed"}</span>
                    <span className="block truncate text-[12px] text-slate-500">{shown(h.phone)} · {[h.current_job_title, h.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</span>
                    {h.last_outcome && <span className="block text-[11.5px] text-slate-400">Last call: {OUTCOME[h.last_outcome] ?? h.last_outcome}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
