"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import type { ReportsNarrativeInput } from "@/lib/reports-narrative";

// Fetches client-side (rather than blocking the server-rendered page on a
// Gemini round trip) so the KPI strip and charts -- which are already fast,
// direct-from-Supabase -- paint immediately, and this one AI-written line
// pops in a beat later. Refetches whenever the underlying stats change
// (range switch), keyed by a stringified snapshot of the input.
export default function AiNarrativeBanner({ stats }: { stats: ReportsNarrativeInput }) {
  const [state, setState] = useState<{ status: "loading" | "done" | "error"; text: string }>({
    status: "loading",
    text: "",
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", text: "" });
    (async () => {
      try {
        const res = await fetch("/api/reports/narrative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stats),
        });
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.narrative) {
          setState({ status: "done", text: body.narrative });
        } else {
          setState({ status: "error", text: body.error ?? "Couldn't generate an AI summary." });
        }
      } catch {
        if (!cancelled) setState({ status: "error", text: "Couldn't generate an AI summary." });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stats)]);

  if (state.status === "error") return null;

  return (
    <div className="flex items-start gap-2.5 rounded-ros-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 mb-4">
      <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
      {state.status === "loading" ? (
        <div className="flex-1 space-y-1.5 py-0.5">
          <div className="h-2.5 w-3/4 rounded-full bg-indigo-100 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded-full bg-indigo-100 animate-pulse" />
        </div>
      ) : (
        <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-snug">{state.text}</p>
      )}
    </div>
  );
}
