"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  HelpCircle,
  UserPlus,
  ChevronDown,
  ChevronUp,
  Info,
  AlertTriangle,
} from "lucide-react";

type RequirementStatus = "met" | "not_met" | "unclear";
type RequirementCheck = { requirement: string; status: RequirementStatus; evidence: string };

type ScoreBreakdown = {
  must_haves_fit: number;
  good_to_haves_fit: number;
  experience_fit: number;
  domain_relevance: number;
  notes: string;
};

type CandidateMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  outcome_adjusted_score: number | null;
  embedding_similarity: number | null;
  reason: string;
  must_haves: RequirementCheck[];
  good_to_haves: RequirementCheck[];
  stability_score: number | null;
  has_ai_summary: boolean;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
};

// Cached auto_match_results on the mandate may still be in the pre-upgrade
// shape until the next match run overwrites it -- normalize defensively so
// an old cached blob never crashes this page, it just renders as "no
// breakdown yet, re-run".
function normalizeCachedMatches(raw: unknown): CandidateMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const row = m as Record<string, unknown>;
    const isChecks = (arr: unknown): arr is RequirementCheck[] =>
      Array.isArray(arr) && arr.every((x) => x && typeof x === "object" && "status" in (x as object));
    const breakdown =
      row.score_breakdown && typeof row.score_breakdown === "object"
        ? (row.score_breakdown as ScoreBreakdown)
        : null;
    return {
      candidate_id: String(row.candidate_id ?? ""),
      full_name: String(row.full_name ?? "Unknown"),
      score: typeof row.score === "number" ? row.score : 0,
      score_breakdown: breakdown,
      outcome_adjusted_score: typeof row.outcome_adjusted_score === "number" ? row.outcome_adjusted_score : null,
      embedding_similarity: typeof row.embedding_similarity === "number" ? row.embedding_similarity : null,
      reason: String(row.reason ?? ""),
      must_haves: isChecks(row.must_haves) ? row.must_haves : [],
      good_to_haves: isChecks(row.good_to_haves) ? row.good_to_haves : [],
      stability_score: typeof row.stability_score === "number" ? row.stability_score : null,
      has_ai_summary: !!row.has_ai_summary,
      current_job_title: typeof row.current_job_title === "string" ? row.current_job_title : null,
      current_employer: typeof row.current_employer === "string" ? row.current_employer : null,
      current_location: typeof row.current_location === "string" ? row.current_location : null,
      total_experience_years: typeof row.total_experience_years === "number" ? row.total_experience_years : null,
      expected_fixed_ctc: typeof row.expected_fixed_ctc === "number" ? row.expected_fixed_ctc : null,
      notice_period: typeof row.notice_period === "string" ? row.notice_period : null,
    };
  });
}

function scoreColor(score: number) {
  if (score >= 75) return "text-emerald-700 bg-emerald-50";
  if (score >= 50) return "text-amber-700 bg-amber-50";
  return "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800";
}

function matchCountColor(met: number, total: number) {
  if (total === 0) return "text-slate-500 bg-slate-100 dark:bg-slate-800";
  if (met === total) return "text-emerald-700 bg-emerald-50";
  if (met === 0) return "text-red-700 bg-red-50";
  return "text-amber-700 bg-amber-50";
}

// A quick "is this candidate new or have we had them for a while" signal --
// requested so a recruiter scanning matches doesn't have to open each
// profile just to tell a fresh registrant from someone who's been sitting
// in the pool for months.
function registeredLabel(iso: string): { text: string; isNew: boolean } {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = new Date(iso).toLocaleDateString();
  const relative = days <= 0 ? "today" : days === 1 ? "1 day ago" : days < 30 ? `${days} days ago` : dateStr;
  return { text: `Registered ${relative}`, isNew: days <= 14 };
}

function registerLabelClass(iso: string): string {
  return registeredLabel(iso).isNew ? "font-medium text-emerald-600" : "";
}

function stabilityLabel(score: number): { label: string; tone: string } {
  if (score >= 71) return { label: "Stable", tone: "text-emerald-700 bg-emerald-50" };
  if (score >= 36) return { label: "Some Movement", tone: "text-amber-700 bg-amber-50" };
  return { label: "Frequent Job-Hopper", tone: "text-red-700 bg-red-50" };
}

function StatusChip({ check }: { check: RequirementCheck }) {
  if (check.status === "met") {
    return (
      <span
        title={check.evidence}
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[11px]"
      >
        <Check className="w-3 h-3 shrink-0" /> {check.requirement}
      </span>
    );
  }
  if (check.status === "not_met") {
    return (
      <span
        title={check.evidence}
        className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 px-2 py-1 text-[11px]"
      >
        <X className="w-3 h-3 shrink-0" /> {check.requirement}
      </span>
    );
  }
  return (
    <span
      title={check.evidence || "Not mentioned in profile or resume — confirm on call"}
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 text-[11px]"
    >
      <HelpCircle className="w-3 h-3 shrink-0" /> {check.requirement}
    </span>
  );
}

function ScoreBreakdownBar({ label, value }: { label: string; value: number }) {
  const barColor = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-400";
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 mb-0.5">
        <span>{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

type ProactiveMatchRow = { id: string; candidate_id: string; match: unknown; created_at: string };

export default function MatchesWorkspace({
  mandateId,
  mustHaves,
  goodToHaves,
  initialMatches,
  initialComputedAt,
  proactiveMatches: initialProactiveMatches,
  linkedCandidateIds: initialLinkedCandidateIds,
}: {
  mandateId: string;
  mustHaves: string[];
  goodToHaves: string[];
  initialMatches?: unknown;
  initialComputedAt?: string | null;
  proactiveMatches?: ProactiveMatchRow[];
  // Candidates already linked to this mandate's pipeline -- lets the
  // "linked to this mandate only" filter work without a round trip, and
  // powers the "In pipeline" badge on every match card.
  linkedCandidateIds?: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<CandidateMatch[] | null>(
    initialMatches ? normalizeCachedMatches(initialMatches) : null
  );
  const [scanned, setScanned] = useState(0);
  const [computedAt, setComputedAt] = useState<string | null>(initialComputedAt ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scoreOpen, setScoreOpen] = useState<Set<string>>(new Set());
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<{ positive: number; negative: number } | null>(null);
  const [extraCriteria, setExtraCriteria] = useState("");
  const [lastRunUsedExtraCriteria, setLastRunUsedExtraCriteria] = useState(false);
  const [fullMatchesOnly, setFullMatchesOnly] = useState(false);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const linkedIdSet = useMemo(() => new Set(initialLinkedCandidateIds ?? []), [initialLinkedCandidateIds]);
  const [registeredAt, setRegisteredAt] = useState<Record<string, string>>({});

  async function runMatch(useExtraCriteria: boolean) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/mandate-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mandateId,
          extraCriteria: useExtraCriteria ? extraCriteria : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Matching failed.");
      } else {
        setMatches(json.matches ?? []);
        setScanned(json.scanned ?? 0);
        setComputedAt(new Date().toISOString());
        setCalibration(json.calibration ?? null);
        setLastRunUsedExtraCriteria(useExtraCriteria && extraCriteria.trim().length > 0);
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

  function toggleScoreOpen(id: string) {
    setScoreOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Snapshots the match's score/breakdown/embedding-similarity onto the
  // candidate_mandate_links row at the moment it's created -- this is the
  // only point where "what did the system think of this candidate" and
  // "what actually happened to them on this mandate" can be tied together
  // later by the outcome-reweight-sweep cron. source distinguishes a
  // recruiter-initiated standard/ad-hoc search from a proactive-matcher hit.
  async function addToPipeline(match: CandidateMatch, source: "gemini_stage2" | "proactive_matcher") {
    const candidateId = match.candidate_id;
    setAddingId(candidateId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: candidateId,
      mandate_id: mandateId,
      added_by: user?.id ?? null,
      match_score: match.score,
      match_score_breakdown: match.score_breakdown,
      match_embedding_similarity: match.embedding_similarity,
      match_source: source,
      matched_at: new Date().toISOString(),
    });
    setAddingId(null);
    if (!error) {
      setAddedIds((prev) => new Set(prev).add(candidateId));
      router.refresh();
    }
  }

  const [proactiveMatches, setProactiveMatches] = useState<(ProactiveMatchRow & { parsed: CandidateMatch })[]>(
    (initialProactiveMatches ?? [])
      .map((row) => {
        const parsed = normalizeCachedMatches([row.match])[0];
        return parsed ? { ...row, parsed } : null;
      })
      .filter((r): r is ProactiveMatchRow & { parsed: CandidateMatch } => r !== null)
  );
  const [dismissingProactiveId, setDismissingProactiveId] = useState<string | null>(null);

  // Registration date per candidate -- fetched separately since neither the
  // cached auto_match_results nor mandate_proactive_matches rows carry it.
  // Batched by whatever candidate_ids are currently showing (main matches +
  // "new since you last looked"), and only re-fetched for ids not already
  // in hand, so re-running the match doesn't re-query candidates already seen.
  useEffect(() => {
    const ids = new Set<string>();
    for (const m of matches ?? []) ids.add(m.candidate_id);
    for (const { parsed } of proactiveMatches) ids.add(parsed.candidate_id);
    const missing = Array.from(ids).filter((id) => !(id in registeredAt));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.from("candidates").select("id, created_at").in("id", missing);
      if (!data) return;
      setRegisteredAt((prev) => {
        const next = { ...prev };
        for (const row of data) next[row.id] = row.created_at;
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, proactiveMatches]);

  async function dismissProactiveMatch(rowId: string) {
    setDismissingProactiveId(rowId);
    const { error } = await supabase.from("mandate_proactive_matches").delete().eq("id", rowId);
    setDismissingProactiveId(null);
    if (!error) {
      setProactiveMatches((prev) => prev.filter((r) => r.id !== rowId));
    }
  }

  const sortedMatches = useMemo(() => {
    if (!matches) return null;
    const sorted = [...matches].sort((a, b) => {
      const metA = a.must_haves.filter((c) => c.status === "met").length;
      const metB = b.must_haves.filter((c) => c.status === "met").length;
      if (metB !== metA) return metB - metA;
      return (b.outcome_adjusted_score ?? b.score) - (a.outcome_adjusted_score ?? a.score);
    });
    const fullOnly = fullMatchesOnly
      ? sorted.filter((m) => m.must_haves.length > 0 && m.must_haves.every((c) => c.status === "met"))
      : sorted;
    return linkedOnly ? fullOnly.filter((m) => linkedIdSet.has(m.candidate_id)) : fullOnly;
  }, [matches, fullMatchesOnly, linkedOnly, linkedIdSet]);

  return (
    <div className="mt-4">
      {proactiveMatches.length > 0 && (
        <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-4">
          <h2 className="text-[13px] font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5" /> New since you last looked ({proactiveMatches.length})
          </h2>
          <p className="text-[11px] text-purple-700/80 dark:text-purple-300/70 mb-3">
            Candidates the system flagged as strong prospects for this mandate as soon as they registered/updated
            their profile — evaluated automatically, no one had to click "Find matches".
          </p>
          <div className="space-y-2">
            {proactiveMatches.map(({ id: rowId, parsed: m }) => (
              <div
                key={rowId}
                className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 rounded-lg border border-purple-100 dark:border-purple-900 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/candidates/${m.candidate_id}?mandateId=${mandateId}`}
                      className="text-[13px] font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 truncate"
                    >
                      {m.full_name}
                    </Link>
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${scoreColor(m.score)}`}>
                      {m.score}
                    </span>
                    {linkedIdSet.has(m.candidate_id) && (
                      <span className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                        In pipeline
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-slate-600 dark:text-slate-400 truncate">{m.reason}</p>
                  {registeredAt[m.candidate_id] && (
                    <p className={`text-[11px] mt-0.5 ${registerLabelClass(registeredAt[m.candidate_id]) || "text-slate-400"}`}>
                      {registeredLabel(registeredAt[m.candidate_id]).text}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => addToPipeline(m, "proactive_matcher")}
                    disabled={addedIds.has(m.candidate_id) || addingId === m.candidate_id}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12px] px-2.5 py-1.5 disabled:opacity-50"
                  >
                    {addedIds.has(m.candidate_id) ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <UserPlus className="w-3 h-3" />
                    )}
                    {addedIds.has(m.candidate_id) ? "Added" : "Add"}
                  </button>
                  <button
                    onClick={() => dismissProactiveMatch(rowId)}
                    disabled={dismissingProactiveId === rowId}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Mandate must-haves</h2>
          {mustHaves.length === 0 ? (
            <p className="text-[12px] text-slate-400">No must-haves defined on this mandate yet.</p>
          ) : (
            <ul className="space-y-1 text-[13px] text-slate-700 dark:text-slate-300 list-disc list-inside">
              {mustHaves.map((mh, i) => (
                <li key={i}>{mh}</li>
              ))}
            </ul>
          )}
          {goodToHaves.length > 0 && (
            <>
              <h3 className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 mt-3 mb-1">
                Good to haves
              </h3>
              <ul className="space-y-1 text-[13px] text-slate-700 dark:text-slate-300 list-disc list-inside">
                {goodToHaves.map((gh, i) => (
                  <li key={i}>{gh}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-500" /> Ad hoc search
          </h2>
          <p className="text-[12px] text-slate-400 mb-2">
            Add extra requirements for this search only — they won&apos;t change the mandate&apos;s saved JD.
            E.g. &quot;Punjabi language is must, 5-9 years experience mandatory, B2C Sales mandatory&quot;.
          </p>
          <textarea
            value={extraCriteria}
            onChange={(e) => setExtraCriteria(e.target.value)}
            rows={4}
            placeholder="Type one or more extra mandatory criteria..."
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-[13px] resize-none focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            onClick={() => runMatch(true)}
            disabled={loading || extraCriteria.trim().length === 0}
            className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-medium py-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" /> Search with extra criteria
              </>
            )}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1 gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Matched candidates</h2>
            <div className="flex items-center gap-3 shrink-0">
              {matches && matches.length > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={fullMatchesOnly}
                    onChange={(e) => setFullMatchesOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Full must-have matches only
                </label>
              )}
              {matches && matches.length > 0 && linkedIdSet.size > 0 && (
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={linkedOnly}
                    onChange={(e) => setLinkedOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Linked to this mandate only
                </label>
              )}
              <button
                onClick={() => runMatch(false)}
                disabled={loading}
                className="text-[12px] text-purple-600 hover:underline disabled:opacity-50"
              >
                {loading ? "Scanning..." : "Re-run standard match"}
              </button>
            </div>
          </div>

          {sortedMatches && (
            <p className="text-[11px] text-slate-400 mb-3">
              {scanned > 0
                ? `${sortedMatches.length} suggested of ${scanned} candidates scanned`
                : `${sortedMatches.length} suggested${computedAt ? ` — computed ${new Date(computedAt).toLocaleDateString()}` : ""}`}
              {lastRunUsedExtraCriteria && (
                <span className="ml-1.5 text-purple-500">· includes your ad hoc criteria (not saved to the mandate)</span>
              )}
              {calibration && calibration.positive + calibration.negative > 0 && (
                <span className="ml-1.5 text-purple-500">
                  · calibrated on {calibration.positive + calibration.negative} past decision
                  {calibration.positive + calibration.negative === 1 ? "" : "s"}
                </span>
              )}
            </p>
          )}

          {error && <p className="text-[12px] text-red-600 mb-2">{error}</p>}

          {!sortedMatches && !loading && (
            <button
              onClick={() => runMatch(false)}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[13px] font-medium py-2"
            >
              <Sparkles className="w-3.5 h-3.5" /> Find matches
            </button>
          )}

          {sortedMatches && sortedMatches.length === 0 && (
            <p className="text-[12px] text-slate-400 py-6 text-center">
              {linkedOnly
                ? "None of the candidates already linked to this mandate are in the current match list. Uncheck the filter to see the full pool."
                : fullMatchesOnly
                  ? "No candidates fully satisfy every must-have. Uncheck the filter to see partial matches."
                  : "No strong matches found in the current candidate pool for this mandate."}
            </p>
          )}

          <div className="space-y-2 max-h-[42rem] overflow-y-auto">
            {sortedMatches?.map((m) => {
              const isOpen = expanded.has(m.candidate_id);
              const isScoreOpen = scoreOpen.has(m.candidate_id);
              const added = addedIds.has(m.candidate_id);
              const metCount = m.must_haves.filter((c) => c.status === "met").length;
              const totalCount = m.must_haves.length;
              const stability = m.stability_score != null ? stabilityLabel(m.stability_score) : null;
              const facts = [
                m.current_job_title && m.current_employer ? `${m.current_job_title} at ${m.current_employer}` : m.current_job_title,
                m.total_experience_years != null ? `${m.total_experience_years} yrs exp` : null,
                m.current_location,
                m.expected_fixed_ctc != null ? `${m.expected_fixed_ctc}L expected` : null,
                m.notice_period,
              ].filter(Boolean);
              return (
                <div key={m.candidate_id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/candidates/${m.candidate_id}?mandateId=${mandateId}`}
                          className="text-[13px] font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 truncate"
                        >
                          {m.full_name}
                        </Link>
                        <button
                          onClick={() => toggleScoreOpen(m.candidate_id)}
                          title="Click to see how this score was calculated"
                          className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded hover:ring-1 hover:ring-current ${scoreColor(m.score)}`}
                        >
                          {m.score} <Info className="w-2.5 h-2.5" />
                        </button>
                        {totalCount > 0 && (
                          <span
                            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${matchCountColor(metCount, totalCount)}`}
                          >
                            {metCount}/{totalCount} must-haves
                          </span>
                        )}
                        {stability && (
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${stability.tone}`}>
                            {stability.label}
                          </span>
                        )}
                        {!m.has_ai_summary && (
                          <Link
                            href={`/candidates/${m.candidate_id}?mandateId=${mandateId}`}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 hover:bg-orange-100"
                            title="Open the profile to generate one"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" /> Summary not generated yet
                          </Link>
                        )}
                        {linkedIdSet.has(m.candidate_id) && (
                          <span className="inline-flex items-center text-[11px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                            In pipeline
                          </span>
                        )}
                      </div>
                      {(facts.length > 0 || registeredAt[m.candidate_id]) && (
                        <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-1">
                          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
                          {facts.length > 0 && registeredAt[m.candidate_id] && <span>·</span>}
                          {registeredAt[m.candidate_id] && (
                            <span className={registerLabelClass(registeredAt[m.candidate_id])}>
                              {registeredLabel(registeredAt[m.candidate_id]).text}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">{m.reason}</p>

                      {isScoreOpen && m.score_breakdown && (
                        <div className="mt-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-1.5">
                          <ScoreBreakdownBar label="Must-haves fit (50%)" value={m.score_breakdown.must_haves_fit} />
                          <ScoreBreakdownBar label="Good-to-haves fit (10%)" value={m.score_breakdown.good_to_haves_fit} />
                          <ScoreBreakdownBar label="Experience fit (20%)" value={m.score_breakdown.experience_fit} />
                          <ScoreBreakdownBar label="Domain relevance (20%)" value={m.score_breakdown.domain_relevance} />
                          {m.score_breakdown.notes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic pt-1">
                              {m.score_breakdown.notes}
                            </p>
                          )}
                        </div>
                      )}
                      {isScoreOpen && !m.score_breakdown && (
                        <p className="mt-2 text-[11px] text-slate-400 italic">
                          No breakdown available for this match yet — re-run the match to get one.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleExpanded(m.candidate_id)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
                    >
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-2.5 space-y-2">
                      {m.must_haves.length > 0 && (
                        <div>
                          <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            Must haves
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {m.must_haves.map((check, i) => (
                              <StatusChip key={i} check={check} />
                            ))}
                          </div>
                        </div>
                      )}
                      {m.good_to_haves.length > 0 && (
                        <div>
                          <p className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                            Good to haves
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {m.good_to_haves.map((check, i) => (
                              <StatusChip key={i} check={check} />
                            ))}
                          </div>
                        </div>
                      )}
                      {m.must_haves.some((c) => c.status === "unclear") && (
                        <p className="text-[11px] text-slate-400 italic">
                          Grey items weren&apos;t mentioned anywhere in the profile or resume — worth a quick
                          confirmation call rather than ruling the candidate out.
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => addToPipeline(m, "gemini_stage2")}
                    disabled={added || addingId === m.candidate_id}
                    className="w-full mt-2 flex items-center justify-center gap-1 rounded-lg border border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12px] py-1.5 disabled:opacity-50"
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
        </div>
      </div>
      </div>
    </div>
  );
}
