"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

export default function AiSummaryPanel({
  candidateId,
  initialSummary,
}: {
  candidateId: string;
  initialSummary: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
      } else {
        setSummary(json.summary);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-semibold text-slate-900">
          AI summary <span className="text-[11px] font-normal text-slate-400">(shown to clients on the shortlist link/portal once generated)</span>
        </h3>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-2.5 py-1 disabled:opacity-60 transition-colors"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {summary ? "Regenerate" : "Generate"}
        </button>
      </div>
      {error && <p className="text-[12px] text-rose-600 mb-2">{error}</p>}
      <p className="text-[13px] text-slate-600 whitespace-pre-wrap bg-slate-50 rounded-lg p-3">
        {summary || "Not generated yet — click Generate to summarize this candidate from their profile data."}
      </p>
    </div>
  );
}
