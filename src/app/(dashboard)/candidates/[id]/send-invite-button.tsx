"use client";

import { useState } from "react";
import { Send, Loader2, Check } from "lucide-react";

export default function SendInviteButton({ candidateId }: { candidateId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        setState("error");
      } else {
        setState("sent");
      }
    } catch {
      setError("Network error — please try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 rounded-ros-md px-3 py-1.5">
        <Check className="w-3 h-3" /> Invite sent
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSend}
        disabled={state === "loading"}
        className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 hover:bg-slate-200 rounded-ros-md px-3 py-1.5 disabled:opacity-60 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
      >
        {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
        Request profile completion
      </button>
      {error && <p className="text-[11px] text-rose-600 max-w-[220px] text-right">{error}</p>}
    </div>
  );
}
