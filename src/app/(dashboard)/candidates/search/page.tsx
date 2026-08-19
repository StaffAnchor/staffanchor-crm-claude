"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Search, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Global free-text candidate search ("prompt window") -- distinct from the
// per-mandate Matching Workspace: no mandate/JD attached, just whatever a
// recruiter types (e.g. "B2B SaaS AEs in Bangalore, 4-7 years, hunting not
// farming"). Scanned pool is a semantic recall (via the candidate's own
// embedding, once backfilled) unioned with a recency fallback pool, so it
// still returns something useful for candidates whose embedding hasn't
// been backfilled yet -- see /lib/candidate-match.ts's
// matchCandidatesForPrompt and the embedding backfill work on Reports.
type Match = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  category: string | null;
  sub_domain: string | null;
};

const EXAMPLE_PROMPTS = [
  "B2B SaaS Account Executives in Bangalore or Mumbai, 4-7 years experience, currently hunting not farming",
  "B2C sales candidates open to relocation, strong in EdTech or FinTech, notice period under 30 days",
  "Sales leaders with team management experience, 8+ years, expected CTC under 30 LPA",
];

function scoreTone(score: number): "success" | "warning" | "neutral" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "neutral";
}

export default function CandidatePromptSearchPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [scanned, setScanned] = useState<number | null>(null);

  async function runSearch(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const res = await fetch("/api/candidate-prompt-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed");
        return;
      }
      setMatches(data.matches ?? []);
      setScanned(data.scanned ?? null);
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Link
        href="/candidates"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Candidates
      </Link>

      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" /> Prompt search
        </h1>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
          Describe who you're looking for in plain English — searches the whole candidate database, not just one mandate.
        </p>
      </div>

      <Card className="p-4 mb-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runSearch(prompt);
          }}
          placeholder="e.g. B2B SaaS Account Executives in Bangalore, 4-7 years, currently hunting not farming"
          rows={3}
          className="w-full text-[13.5px] text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-ros-md px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800"
        />
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {EXAMPLE_PROMPTS.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-[11.5px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-ros-full px-2.5 py-1 transition-colors duration-200 ease-ros"
              >
                {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
              </button>
            ))}
          </div>
          <button
            onClick={() => runSearch(prompt)}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-1.5 text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-ros-md px-4 py-2 transition-colors duration-200 ease-ros disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </Card>

      {error && (
        <Card className="p-4 mb-4 border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20">
          <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>
        </Card>
      )}

      {matches && (
        <>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2.5">
            {matches.length} match{matches.length === 1 ? "" : "es"} {scanned != null ? `· scanned ${scanned} candidates` : ""}
          </p>
          {matches.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-slate-500 dark:text-slate-400">No strong matches for this request. Try loosening a constraint.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <Link key={m.candidate_id} href={`/candidates/${m.candidate_id}`}>
                  <Card className="p-3.5 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors duration-200 ease-ros cursor-pointer">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-medium text-slate-800 dark:text-slate-200 truncate">{m.full_name}</p>
                          <Badge tone={scoreTone(m.score)}>{m.score}</Badge>
                        </div>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {[m.current_job_title, m.current_employer].filter(Boolean).join(" at ")}
                          {m.current_location ? ` · ${m.current_location}` : ""}
                          {m.total_experience_years != null ? ` · ${m.total_experience_years} yrs` : ""}
                        </p>
                        <p className="text-[12.5px] text-slate-600 dark:text-slate-300 mt-1.5">{m.reason}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
