"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, MessageCircle } from "lucide-react";

// Shows what a profile is missing and lets a recruiter ask the candidate for just those details:
// in the WhatsApp chat if the free-message window is open, by email otherwise.
export default function AskMissingDetails({ candidateId, missing }: { candidateId: string; missing: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (missing.length === 0) return null;

  async function ask() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/ask-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        setState("idle");
        return;
      }
      setNote(data.via === "whatsapp" ? "Asked on WhatsApp. Their answers will fill in the profile." : "WhatsApp window is closed, so we emailed them a link instead.");
      setState("done");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setState("idle");
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" /> Missing: {missing.join(", ")}
      </span>
      {state === "done" ? (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
          <Check className="h-3 w-3" /> {note}
        </span>
      ) : (
        <button onClick={ask} disabled={state === "loading"} className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
          {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />} Ask for missing details
        </button>
      )}
      {error && <span className="text-rose-600">{error}</span>}
    </div>
  );
}
