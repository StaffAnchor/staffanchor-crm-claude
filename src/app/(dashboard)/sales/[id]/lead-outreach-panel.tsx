"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import type { OutreachChannel } from "@/lib/generate-sales-outreach";

// Calls /api/sales-leads/[id]/draft-outreach so the founder gets a
// ready-to-edit LinkedIn DM or cold email instead of writing outreach from
// scratch for every lead -- one of the four "feels like 4-5 AEs" features
// requested alongside the daily briefing, lead scoring, and referral radar.
export default function LeadOutreachPanel({ leadId }: { leadId: string }) {
  const [channel, setChannel] = useState<OutreachChannel>("linkedin");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/sales-leads/${leadId}/draft-outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Couldn't generate a draft.");
        return;
      }
      setDraft(body.draft ?? "");
    } catch {
      setError("Couldn't reach the AI drafting service.");
    } finally {
      setLoading(false);
    }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-blue-500" />
        <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">AI Outreach Draft</h2>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {(["linkedin", "email"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`text-[11.5px] px-2.5 py-1.5 rounded-ros-md ring-1 transition-colors duration-200 ease-ros ${
              channel === c
                ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800"
                : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700"
            }`}
          >
            {c === "linkedin" ? "LinkedIn DM" : "Cold email"}
          </button>
        ))}
        <Button variant="secondary" size="sm" onClick={generate} disabled={loading} className="ml-auto">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Generate draft"}
        </Button>
      </div>

      {error && <p className="text-[12px] text-rose-500 mb-2">{error}</p>}

      {draft ? (
        <div className="relative">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full text-[12.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
          />
          <button
            onClick={copyDraft}
            className="absolute top-2 right-2 text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      ) : (
        !loading && (
          <p className="text-[11.5px] text-slate-400">
            Generate a personalized draft, then edit it to taste before sending — review before every send, this is a starting point, not an auto-pilot.
          </p>
        )
      )}
    </Card>
  );
}
