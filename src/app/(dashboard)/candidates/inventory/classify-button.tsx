"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

// Runs the AI over everyone still waiting, in batches, until nobody is left. New people are picked up every night
// without pressing anything. Used for "what they do" (role clusters) and "what they sell" (selling profiles).
export default function ClassifyButton({
  endpoint = "/api/admin/inventory/classify",
  verb = "Classify",
  title = "The AI reads each person's CV facts and decides what they actually do",
  allowRecheck = true,
}: {
  endpoint?: string;
  verb?: string;
  title?: string;
  allowRecheck?: boolean;
}) {
  const router = useRouter();
  const [waiting, setWaiting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const post = (body: Record<string, unknown>) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    let alive = true;
    post({ mode: "missing", countOnly: true })
      .then((r) => r.json())
      .then((d) => alive && d.ok && setWaiting(d.remaining))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(mode: "missing" | "all") {
    setBusy(true);
    setMsg(null);
    let done = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const res = await post({ mode });
        const d = await res.json().catch(() => ({}));
        if (!d.ok) {
          setMsg(d.error ?? "Something went wrong. Progress so far is saved.");
          break;
        }
        done += d.processed;
        setWaiting(d.remaining);
        setMsg(`${done} done so far…`);
        if (d.processed === 0 || d.remaining === 0) {
          setMsg(`Done. ${done} people.`);
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
        title={title}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Working…" : waiting == null ? `${verb} with AI` : waiting === 0 ? "All done" : `${verb} ${waiting} with AI`}
      </button>
      {allowRecheck && !busy && waiting === 0 && (
        <button type="button" onClick={() => run("all")} className="text-[12px] font-medium text-teal-600 hover:underline" title="Have the AI re-read everyone, replacing the keyword guesses">
          Re-check everyone
        </button>
      )}
    </div>
  );
}
