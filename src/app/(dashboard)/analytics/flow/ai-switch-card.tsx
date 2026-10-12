"use client";

import { useState, useTransition } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { setAiPaused } from "./actions";

// One switch that stops every AI call in the CRM (matching, CV reading, role
// drafts, embeddings). Use it if suggestions look wrong or spend spikes; nothing
// is deleted, existing suggestions stay, new ones just stop being made.
export default function AiSwitchCard({ initialPaused }: { initialPaused: boolean }) {
  const [paused, setPaused] = useState(initialPaused);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flip() {
    const next = !paused;
    if (next && !window.confirm("Pause all AI features now? Matching, CV reading and role drafts stop until you resume.")) return;
    setError(null);
    start(async () => {
      const res = await setAiPaused(next);
      if (res.ok) setPaused(next);
      else setError(res.error ?? "Could not change the switch");
    });
  }

  return (
    <Card className={paused ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {paused ? <PauseCircle className="w-6 h-6 text-amber-600 mt-0.5" /> : <PlayCircle className="w-6 h-6 text-emerald-600 mt-0.5" />}
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{paused ? "AI is paused" : "AI is running"}</p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              {paused
                ? "No new AI suggestions, CV reading or drafts are being made. Existing suggestions stay visible. Resume when ready."
                : "Matching, CV reading and role drafts are active. Pause here if suggestions look wrong or spend jumps."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={flip}
          disabled={pending}
          className={`text-[13px] font-medium rounded-lg px-4 py-2 transition-colors disabled:opacity-60 ${
            paused ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-900 hover:bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900"
          }`}
        >
          {pending ? "Saving…" : paused ? "Resume AI" : "Pause AI"}
        </button>
      </div>
      {error && <p className="text-[12px] text-rose-600 mt-3">{error}</p>}
    </Card>
  );
}
