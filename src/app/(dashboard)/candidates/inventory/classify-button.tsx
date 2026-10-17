"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

// Lets the AI work out what each remaining person does, from the CV facts already read. It runs in batches
// until nobody is left waiting. New people are picked up every night without pressing anything.
export default function ClassifyButton() {
  const router = useRouter();
  const [waiting, setWaiting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/inventory/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "missing", countOnly: true }) })
      .then((r) => r.json())
      .then((d) => alive && d.ok && setWaiting(d.remaining))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function run(mode: "missing" | "all") {
    setBusy(true);
    setMsg(null);
    let done = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const res = await fetch("/api/admin/inventory/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
        const d = await res.json().catch(() => ({}));
        if (!d.ok) {
          setMsg(d.error ?? "Something went wrong. Progress so far is saved.");
          break;
        }
        done += d.processed;
        setWaiting(d.remaining);
        setMsg(`Classified ${done} so far…`);
        if (d.processed === 0 || d.remaining === 0) {
          setMsg(`Done. Classified ${done} people.`);
          break;
        }
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
      <button
        type="button"
        onClick={() => run("missing")}
        disabled={busy || waiting === 0}
        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
        title="The AI reads each person's CV facts and decides what they actually do"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Classifying…" : waiting == null ? "Classify with AI" : waiting === 0 ? "Everyone classified" : `Classify ${waiting} with AI`}
      </button>
      {!busy && waiting === 0 && (
        <button type="button" onClick={() => run("all")} className="text-[12px] font-medium text-blue-600 hover:underline" title="Have the AI re-read everyone, replacing the keyword guesses">
          Re-check everyone
        </button>
      )}
    </div>
  );
}
