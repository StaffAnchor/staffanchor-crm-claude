"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, HelpCircle, X, Loader2, Undo2, ExternalLink, UserCheck, UserX, Clock } from "lucide-react";
import type { MatchChecks, ReqCheck } from "@/lib/ai-match";

type CheckData = { fit: "strong" | "possible" | "weak"; score: number; summary: string | null; checks: MatchChecks };

export type TriageItem = {
  linkId: string;
  candidateId: string;
  name: string;
  headline: string;
  years: number | null;
  location: string | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  notice: string | null;
  stability: number | null;
  summary: string | null;
  unseen: boolean;
  hasFacts: boolean;
  salesChips: string[];
  recentRoles: string[];
  flags: { kind: string; detail: string }[];
  check: CheckData | null;
};

const REASONS: { value: string; label: string }[] = [
  { value: "skills_mismatch", label: "Skills or experience" },
  { value: "salary_mismatch", label: "Salary" },
  { value: "location_mismatch", label: "Location" },
  { value: "culture_fit", label: "Culture fit" },
  { value: "unresponsive", label: "Unresponsive" },
  { value: "other_internal", label: "Other" },
];

const FIT: Record<CheckData["fit"], { label: string; cls: string }> = {
  strong: { label: "Strong", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  possible: { label: "Possible", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  weak: { label: "Weak", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const fmtCtc = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} L`;

function StatusIcon({ s }: { s: ReqCheck["status"] }) {
  if (s === "met") return <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Met" />;
  if (s === "missing") return <X className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Missing" />;
  return <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="To confirm" />;
}

function ReqChip({ c }: { c: ReqCheck }) {
  const cls =
    c.status === "met"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      : c.status === "missing"
        ? "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
        : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] ${cls}`} title={c.evidence ?? ""}>
      <StatusIcon s={c.status} />
      <span className="max-w-[220px] truncate">{c.requirement}</span>
    </span>
  );
}

type Action = "shortlist" | "reject" | "later";
type HistoryEntry = { linkId: string; action: Action; index: number };

export default function TriageDeck({
  mandateId,
  roleTitle,
  clientName,
  hasMustHaves,
  items,
  totalWaiting,
}: {
  mandateId: string;
  roleTitle: string;
  clientName: string;
  hasMustHaves: boolean;
  items: TriageItem[];
  totalWaiting: number;
}) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [checks, setChecks] = useState<Record<string, CheckData | "loading" | { error: string }>>(() => {
    const init: Record<string, CheckData> = {};
    for (const it of items) if (it.check) init[it.candidateId] = it.check;
    return init;
  });
  const requested = useRef<Set<string>>(new Set());

  const current = items[index] ?? null;
  const counts = useMemo(() => {
    const c = { shortlist: 0, reject: 0, later: 0 };
    for (const h of history) c[h.action]++;
    return c;
  }, [history]);

  const loadCheck = useCallback(
    async (it: TriageItem) => {
      if (!hasMustHaves || requested.current.has(it.candidateId) || checks[it.candidateId]) return;
      // No state is set before the request: an applicant with no entry yet is
      // shown as "checking" until the answer arrives.
      requested.current.add(it.candidateId);
      try {
        const res = await fetch(`/api/mandates/${mandateId}/triage/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: it.candidateId }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          requested.current.delete(it.candidateId);
          setChecks((c) => ({ ...c, [it.candidateId]: { error: body.error ?? "Couldn't check this one." } }));
          return;
        }
        setChecks((c) => ({ ...c, [it.candidateId]: body as CheckData }));
      } catch {
        requested.current.delete(it.candidateId);
        setChecks((c) => ({ ...c, [it.candidateId]: { error: "Couldn't reach the server." } }));
      }
    },
    [hasMustHaves, mandateId, checks]
  );

  // Check the current applicant and the next one, so the next card is ready.
  useEffect(() => {
    // State updates happen after the network request returns, not during this
    // effect, so the cascading-render warning does not apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (current) void loadCheck(current);
    const next = items[index + 1];
    if (next) void loadCheck(next);
  }, [index, current, items, loadCheck]);

  const decide = useCallback(
    async (action: Action, reasonCode?: string) => {
      if (!current || busy) return;
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/mandates/${mandateId}/triage/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: current.linkId, action, reasonCode }),
      });
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) {
        setError(body.error ?? "That didn't work. Try again.");
        return;
      }
      setHistory((h) => [...h, { linkId: current.linkId, action, index }]);
      setRejecting(false);
      setIndex((i) => i + 1);
    },
    [current, busy, mandateId, index]
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/mandates/${mandateId}/triage/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId: last.linkId, action: "undo", previousStage: "sourced" }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't undo.");
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setRejecting(false);
    setIndex(last.index);
  }, [history, busy, mandateId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") void decide("shortlist");
      else if (k === "n") setRejecting((r) => !r);
      else if (k === "l" || k === "arrowright") void decide("later");
      else if (k === "u") void undo();
      else if (k === "escape") setRejecting(false);
      else if (rejecting && /^[1-6]$/.test(k)) void decide("reject", REASONS[Number(k) - 1].value);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo, rejecting]);

  const header = (
    <div className="mb-4">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Review applicants</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400">
        {roleTitle}
        {clientName ? ` · ${clientName}` : ""}
      </p>
    </div>
  );

  if (items.length === 0 || !current) {
    const done = history.length;
    return (
      <div>
        {header}
        <div className="rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-8 text-center">
          <p className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{done > 0 ? "Queue cleared" : "No applicants waiting"}</p>
          {done > 0 && (
            <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
              {counts.shortlist} shortlisted, {counts.reject} not a fit, {counts.later} set aside.
              {totalWaiting > items.length ? ` ${totalWaiting - items.length} more are waiting; reload to continue.` : ""}
            </p>
          )}
          <div className="mt-4 flex justify-center gap-2">
            {history.length > 0 && (
              <button onClick={undo} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                <Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo last
              </button>
            )}
            <Link href={`/mandates/${mandateId}?stage=shortlisted`} className="rounded-lg bg-slate-900 text-white text-[13px] font-medium px-3 py-2 hover:bg-slate-800">
              See the shortlisted
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const chk = checks[current.candidateId];
  const checkData = chk && typeof chk === "object" && "fit" in chk ? (chk as CheckData) : null;
  const toConfirm = checkData ? [...checkData.checks.must, ...checkData.checks.good].filter((c) => c.status !== "met" && c.question).slice(0, 4) : [];
  const progress = Math.round((index / Math.max(1, items.length)) * 100);

  return (
    <div>
      {header}
      <div className="mb-3 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400">
        <span>
          {index + 1} of {items.length}
          {totalWaiting > items.length ? ` (${totalWaiting} waiting in all)` : ""}
        </span>
        <span>
          {counts.shortlist} shortlisted · {counts.reject} not a fit · {counts.later} later
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mb-4 overflow-hidden">
        <div className="h-full bg-teal-600" style={{ width: `${progress}%` }} />
      </div>

      <section className="rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">{current.name}</h2>
            <p className="text-[13px] text-slate-600 dark:text-slate-300">{current.headline || "Role not stated"}</p>
          </div>
          <Link href={`/candidates/${current.candidateId}?mandateId=${mandateId}`} target="_blank" className="shrink-0 inline-flex items-center gap-1 text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
            Full profile <ExternalLink className="w-3 h-3" aria-hidden />
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
          {[
            ["Experience", current.years != null ? `${current.years} yrs` : "Not stated"],
            ["Location", current.location ?? "Not stated"],
            ["CTC", current.currentCtc == null && current.expectedCtc == null ? "No CTC available" : `${current.currentCtc != null ? fmtCtc(current.currentCtc) : "?"} now · ${current.expectedCtc != null ? fmtCtc(current.expectedCtc) : "?"} expected`],
            ["Notice", current.notice ?? "Not stated"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
              <dd className={`text-slate-800 dark:text-slate-200 ${v === "No CTC available" ? "text-amber-700 dark:text-amber-300" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Against this role</p>
          {!hasMustHaves ? (
            <p className="text-[13px] text-amber-800 dark:text-amber-300">Set the must-haves on the role first, so each applicant can be checked.</p>
          ) : chk === "loading" || chk === undefined ? (
            <p className="inline-flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Checking the CV against the must-haves...
            </p>
          ) : checkData ? (
            <div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${FIT[checkData.fit].cls}`}>{FIT[checkData.fit].label}</span>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">{checkData.score}/100</span>
              </div>
              {checkData.summary && <p className="mt-1.5 text-[13.5px] text-slate-800 dark:text-slate-200">{checkData.summary}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {checkData.checks.must.map((c, i) => (
                  <ReqChip key={i} c={c} />
                ))}
              </div>
              {toConfirm.length > 0 && (
                <div className="mt-3">
                  <p className="text-[12px] font-medium text-amber-800 dark:text-amber-300">To confirm on a call</p>
                  <ul className="mt-1 space-y-1 text-[13px] text-slate-700 dark:text-slate-300">
                    {toConfirm.map((c, i) => (
                      <li key={i}>
                        {c.question}
                        <span className="text-slate-400"> · {c.requirement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-[13px] text-slate-600 dark:text-slate-300">
              {(chk as { error: string }).error}{" "}
              <button
                onClick={() => {
                  requested.current.delete(current.candidateId);
                  setChecks((c) => {
                    const n = { ...c };
                    delete n[current.candidateId];
                    return n;
                  });
                }}
                className="underline"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        {current.salesChips.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Sales profile from the CV</p>
            <div className="flex flex-wrap gap-1.5">
              {current.salesChips.map((c) => (
                <span key={c} className="rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200 px-2.5 py-0.5 text-[12px]">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
        {current.recentRoles.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-300">
            {current.recentRoles.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {current.flags.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[12.5px] text-amber-900 dark:text-amber-100">
            {current.flags.map((f, i) => (
              <p key={i}>{f.detail}</p>
            ))}
          </div>
        )}
        {!current.hasFacts && current.summary && <p className="mt-3 text-[13px] text-slate-600 dark:text-slate-300">{current.summary}</p>}

        {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}

        {rejecting ? (
          <div className="mt-5">
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-2">Why isn&apos;t this a fit? (press 1 to 6)</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r, i) => (
                <button key={r.value} onClick={() => decide("reject", r.value)} disabled={busy} className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="text-slate-400 mr-1">{i + 1}</span>
                  {r.label}
                </button>
              ))}
              <button onClick={() => setRejecting(false)} className="px-2 text-[13px] text-slate-500 dark:text-slate-400">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={() => decide("shortlist")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[14px] font-medium px-4 py-2.5 hover:bg-slate-800 disabled:opacity-60">
              <UserCheck className="w-4 h-4" aria-hidden /> Shortlist <kbd className="ml-1 text-[11px] opacity-60">S</kbd>
            </button>
            <button onClick={() => setRejecting(true)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-[14px] font-medium px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800">
              <UserX className="w-4 h-4" aria-hidden /> Not a fit <kbd className="ml-1 text-[11px] opacity-50">N</kbd>
            </button>
            <button onClick={() => decide("later")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[14px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Clock className="w-4 h-4" aria-hidden /> Later <kbd className="ml-1 text-[11px] opacity-50">L</kbd>
            </button>
            {history.length > 0 && (
              <button onClick={undo} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
                <Undo2 className="w-3.5 h-3.5" aria-hidden /> Undo <kbd className="text-[11px] opacity-50">U</kbd>
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
