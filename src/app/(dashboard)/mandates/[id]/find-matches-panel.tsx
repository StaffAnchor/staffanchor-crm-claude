"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2, Check, X, UserPlus, ChevronDown, ChevronUp } from "lucide-react";

type CandidateMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  must_haves_met: string[];
  must_haves_missing: string[];
  good_to_haves_met: string[];
};

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-700 bg-emerald-50";
  if (score >= 50) return "text-amber-700 bg-amber-50";
  return "text-slate-600 bg-slate-100";
}

export default function FindMatchesPanel({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<CandidateMatch[] | null>(null);
  const [scanned, setScanned] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);

  async function runMatch() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mandate-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Matching failed.");
      } else {
        setMatches(json.matches ?? []);
        setScanned(json.scanned ?? 0);
      }
    } catch {
      setError("Matching failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addToPipeline(candidateId: string) {
    setAddingId(candidateId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: candidateId,
      mandate_id: mandateId,
      added_by: user?.id ?? null,
    });
    setAddingId(null);
    if (!error) {
      setAddedIds((prev) => new Set(prev).add(candidateId));
      router.refresh();
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Find matching candidates
        </h2>
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        AI scans your existing candidate pool against this mandate&apos;s JD, must haves, and good to haves.
      </p>

      {!matches && (
        <button
          onClick={runMatch}
          disabled={loading}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-medium py-2 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning candidate pool...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" /> Find matches
            </>
          )}
        </button>
      )}

      {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}

      {matches && (
        <>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] text-slate-400">
              {matches.length} suggested of {scanned} candidates scanned
            </p>
            <button
              onClick={runMatch}
              disabled={loading}
              className="text-[11px] text-purple-600 hover:underline disabled:opacity-50"
            >
              {loading ? "Re-scanning..." : "Re-run"}
            </button>
          </div>

          {matches.length === 0 && (
            <p className="text-[12px] text-slate-400 py-4 text-center">
              No strong matches found in the current candidate pool for this mandate.
            </p>
          )}

          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {matches.map((m) => {
              const isOpen = expanded.has(m.candidate_id);
              const added = addedIds.has(m.candidate_id);
              return (
                <div key={m.candidate_id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/candidates/${m.candidate_id}`}
                          className="text-[13px] font-medium text-slate-900 hover:text-blue-600 truncate"
                        >
                          {m.full_name}
                        </Link>
                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${scoreColor(m.score)}`}>
                          {m.score}
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-600 mt-0.5">{m.reason}</p>
                    </div>
                    <button
                      onClick={() => toggleExpanded(m.candidate_id)}
                      className="text-slate-400 hover:text-slate-700 shrink-0"
                    >
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      {m.must_haves_met.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.must_haves_met.map((item, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">
                              <Check className="w-2.5 h-2.5" /> {item}
                            </span>
                          ))}
                        </div>
                      )}
                      {m.must_haves_missing.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.must_haves_missing.map((item, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-red-50 text-red-700 px-2 py-0.5">
                              <X className="w-2.5 h-2.5" /> {item}
                            </span>
                          ))}
                        </div>
                      )}
                      {m.good_to_haves_met.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.good_to_haves_met.map((item, i) => (
                            <span key={i} className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">
                              <Check className="w-2.5 h-2.5" /> {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => addToPipeline(m.candidate_id)}
                    disabled={added || addingId === m.candidate_id}
                    className="w-full mt-2 flex items-center justify-center gap-1 rounded-lg border border-slate-300 hover:bg-slate-50 text-[12px] py-1.5 disabled:opacity-50"
                  >
                    {added ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" /> Added to pipeline
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3 h-3" /> {addingId === m.candidate_id ? "Adding..." : "Add to pipeline"}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
