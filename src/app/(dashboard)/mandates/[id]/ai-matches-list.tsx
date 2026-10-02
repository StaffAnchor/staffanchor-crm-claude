"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, HelpCircle, X, ChevronDown } from "lucide-react";
import type { MatchChecks, ReqCheck } from "@/lib/ai-match";

export type MatchItem = {
  candidateId: string;
  name: string;
  headline: string;
  years: number | null;
  location: string | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  fit: "strong" | "possible" | "weak";
  score: number;
  summary: string | null;
  checks: MatchChecks;
  stale: boolean;
  status: "suggested" | "added";
};

const FIT_STYLE: Record<MatchItem["fit"], { label: string; cls: string }> = {
  strong: { label: "Strong", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  possible: { label: "Possible", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  weak: { label: "Weak", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

type CtcBasis = "expected_else_current" | "current" | "expected";

// The number a candidate is judged on for the CTC filter, or null if the
// profile has none for the chosen basis.
function ctcFor(m: MatchItem, basis: CtcBasis): number | null {
  if (basis === "current") return m.currentCtc;
  if (basis === "expected") return m.expectedCtc;
  return m.expectedCtc ?? m.currentCtc;
}

function fmtCtc(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1)} L`;
}

const DISMISS_REASONS = ["Wrong domain or motion", "Experience doesn't fit", "Compensation doesn't fit", "Location doesn't fit", "Other"];

function StatusIcon({ s }: { s: ReqCheck["status"] }) {
  if (s === "met") return <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Met" />;
  if (s === "missing") return <X className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Missing" />;
  return <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-label="To confirm" />;
}

function Chip({ c }: { c: ReqCheck }) {
  const cls =
    c.status === "met"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      : c.status === "missing"
        ? "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
        : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${cls}`} title={c.evidence ?? c.question ?? ""}>
      <StatusIcon s={c.status} />
      <span className="max-w-[170px] truncate">{c.requirement}</span>
    </span>
  );
}

function Card({ m, mandateId, onChanged }: { m: MatchItem; mandateId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const [error, setError] = useState<string | null>(null);
  const f = FIT_STYLE[m.fit];
  const doubts = [...m.checks.must, ...m.checks.good].filter((c) => c.status !== "met");

  async function decide(action: "add" | "dismiss") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/mandates/${mandateId}/ai-match/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: m.candidateId, action, reason: action === "dismiss" ? reason : undefined }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "That didn't work. Try again.");
      return;
    }
    onChanged();
  }

  return (
    <li className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 ${m.stale ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/candidates/${m.candidateId}`} className="text-[14px] font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              {m.name}
            </Link>
            <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${f.cls}`}>{f.label}</span>
            <span className="text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">{m.score}/100</span>
            {m.stale && <span className="text-[11px] text-slate-500 dark:text-slate-400">Requirements changed, re-check</span>}
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
            {[m.headline, m.years != null ? `${m.years} yrs` : null, m.location].filter(Boolean).join(" · ")}
          </p>
          <p className={`text-[12px] ${m.currentCtc == null && m.expectedCtc == null ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>
            {m.currentCtc == null && m.expectedCtc == null
              ? "No CTC available"
              : [m.currentCtc != null ? `Current ${fmtCtc(m.currentCtc)}` : "Current: not given", m.expectedCtc != null ? `Expected ${fmtCtc(m.expectedCtc)}` : "Expected: not given"].join(" · ")}
          </p>
        </div>
        {m.status === "added" ? (
          <span className="shrink-0 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">In pipeline</span>
        ) : (
          <div className="shrink-0 flex items-center gap-2">
            <button onClick={() => setDismissing((d) => !d)} disabled={busy !== null} className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
              Not a fit
            </button>
            <button
              onClick={() => decide("add")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[12.5px] font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60"
            >
              {busy === "add" && <Loader2 className="w-3 h-3 animate-spin" />} Add to pipeline
            </button>
          </div>
        )}
      </div>

      {m.summary && <p className="mt-2 text-[13px] text-slate-700 dark:text-slate-300">{m.summary}</p>}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {m.checks.must.map((c, i) => (
          <Chip key={`m${i}`} c={c} />
        ))}
      </div>
      {(m.checks.experience === "below" || m.checks.experience === "above" || m.checks.location === "other" || m.checks.location === "relocate") && (
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          {[
            m.checks.experience === "below" ? "Below the experience asked" : m.checks.experience === "above" ? "Above the experience asked" : null,
            m.checks.location === "other" ? "Based elsewhere" : m.checks.location === "relocate" ? "Based elsewhere, open to relocate" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {dismissing && (
        <div className="mt-3 flex items-center gap-2">
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px]">
            {DISMISS_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button onClick={() => decide("dismiss")} disabled={busy !== null} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
            {busy === "dismiss" ? "Saving..." : "Confirm"}
          </button>
          <span className="text-[11.5px] text-slate-500 dark:text-slate-400">They stay in the bank for other roles.</span>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

      <button onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide" : "Show"} evidence{doubts.length > 0 ? ` and ${doubts.length} to confirm` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[12.5px]">
          {([
            ["Must haves", m.checks.must],
            ["Good to haves", m.checks.good],
          ] as const).map(([title, list]) =>
            list.length === 0 ? null : (
              <div key={title}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">{title}</p>
                <ul className="space-y-1.5">
                  {list.map((c, i) => (
                    <li key={i} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
                      <StatusIcon s={c.status} />
                      <div className="min-w-0">
                        <p className="text-slate-800 dark:text-slate-200">{c.requirement}</p>
                        {c.evidence && <p className="text-slate-500 dark:text-slate-400">{c.evidence}</p>}
                        {c.question && <p className="text-amber-800 dark:text-amber-300">Ask: {c.question}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      )}
    </li>
  );
}

export default function AiMatchesList({
  mandateId,
  fullPage = false,
  roleOpen,
  hasMustHaves,
  lastRunAt,
  cvsRead,
  cvsTotal,
  items,
  budgetMin,
  budgetMax,
}: {
  mandateId: string;
  fullPage?: boolean;
  roleOpen: boolean;
  hasMustHaves: boolean;
  lastRunAt: string | null;
  cvsRead: number;
  cvsTotal: number;
  items: MatchItem[];
  budgetMin: number | null;
  budgetMax: number | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWeak, setShowWeak] = useState(false);
  // CTC filter (lakhs per annum). The maximum starts at the role's budget when
  // there is one; clear it to see everyone.
  const [ctcMin, setCtcMin] = useState("");
  const [ctcMax, setCtcMax] = useState(budgetMax != null ? String(budgetMax) : "");
  const [ctcBasis, setCtcBasis] = useState<CtcBasis>("expected_else_current");
  const [includeNoCtc, setIncludeNoCtc] = useState(true);

  const suggested = items.filter((i) => i.status === "suggested");
  const added = items.filter((i) => i.status === "added");
  const order = { strong: 0, possible: 1, weak: 2 } as const;
  const minV = ctcMin.trim() === "" ? null : Number(ctcMin);
  const maxV = ctcMax.trim() === "" ? null : Number(ctcMax);
  const ctcActive = (minV != null && Number.isFinite(minV)) || (maxV != null && Number.isFinite(maxV));
  const passesCtc = (m: MatchItem) => {
    const v = ctcFor(m, ctcBasis);
    if (v == null) return includeNoCtc;
    if (minV != null && Number.isFinite(minV) && v < minV) return false;
    if (maxV != null && Number.isFinite(maxV) && v > maxV) return false;
    return true;
  };
  const afterCtc = (list: MatchItem[]) => list.filter(passesCtc);
  const visible = afterCtc(suggested.filter((i) => showWeak || i.fit !== "weak")).sort((a, b) => order[a.fit] - order[b.fit] || b.score - a.score);
  const weakCount = suggested.filter((i) => i.fit === "weak").length;
  const hiddenByCtc = suggested.filter((i) => (showWeak || i.fit !== "weak") && !passesCtc(i)).length;
  const noCtcCount = suggested.filter((i) => ctcFor(i, ctcBasis) == null).length;

  async function run() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/ai-match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Matching failed. Try again.");
      } else {
        setMessage(
          body.evaluated === 0
            ? body.poolSize === 0
              ? "No new candidates to check yet. More appear as CVs are read."
              : "Everything in range is already checked."
            : `Checked ${body.evaluated}: ${body.strong} strong, ${body.possible} possible, ${body.weak} weak.${body.remaining > 0 ? ` ${body.remaining} more to check, press again.` : ""}${body.failed > 0 ? ` ${body.failed} couldn't be read.` : ""}`
        );
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles className="w-4 h-4 text-teal-600" aria-hidden /> AI matches from your candidate bank
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
            Candidates whose CVs have been read ({cvsRead} of {cvsTotal}), checked against this role&apos;s must-haves. A doubt isn&apos;t a no: it&apos;s something to confirm with the candidate.
            {lastRunAt ? ` Last checked ${new Date(lastRunAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : ""}
          </p>
          {!fullPage && (
            <Link href={`/mandates/${mandateId}/ai-matches`} className="mt-1.5 inline-block text-[12.5px] font-medium text-teal-700 dark:text-teal-300 hover:underline">
              Open full screen
            </Link>
          )}
        </div>
        <button
          onClick={run}
          disabled={running || !roleOpen || !hasMustHaves}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {running ? "Checking..." : suggested.length > 0 ? "Find more matches" : "Find matches"}
        </button>
      </div>

      {!roleOpen && <p className="text-[13px] text-slate-600 dark:text-slate-300 mb-3">This role isn&apos;t open, so it isn&apos;t being matched.</p>}
      {roleOpen && !hasMustHaves && (
        <p className="text-[13px] text-amber-800 dark:text-amber-300 mb-3">Set the must-haves first (Basic details, then Draft from the JD). Matching checks candidates against them.</p>
      )}
      {message && <p className="text-[13px] text-slate-700 dark:text-slate-300 mb-3">{message}</p>}
      {error && <p className="text-[13px] text-red-600 mb-3">{error}</p>}

      {suggested.length > 0 && (
        <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">CTC min (lakhs)</label>
              <input value={ctcMin} onChange={(e) => setCtcMin(e.target.value)} inputMode="decimal" placeholder="Any" className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[13px]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">CTC max (lakhs)</label>
              <input value={ctcMax} onChange={(e) => setCtcMax(e.target.value)} inputMode="decimal" placeholder="Any" className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[13px]" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Judge on</label>
              <select value={ctcBasis} onChange={(e) => setCtcBasis(e.target.value as CtcBasis)} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[13px]">
                <option value="expected_else_current">Expected CTC, else current</option>
                <option value="current">Current CTC</option>
                <option value="expected">Expected CTC only</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-300 pb-1.5">
              <input type="checkbox" checked={includeNoCtc} onChange={(e) => setIncludeNoCtc(e.target.checked)} />
              Include candidates with no CTC ({noCtcCount})
            </label>
            {(ctcMin || ctcMax) && (
              <button onClick={() => { setCtcMin(""); setCtcMax(""); }} className="text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 pb-1.5">
                Clear CTC range
              </button>
            )}
          </div>
          <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">
            {budgetMin != null || budgetMax != null ? `Role budget: ${budgetMin ?? "?"} to ${budgetMax ?? "?"} lakhs. ` : "No budget set on this role. "}
            {ctcActive && hiddenByCtc > 0 ? `${hiddenByCtc} ${hiddenByCtc === 1 ? "candidate is" : "candidates are"} hidden by the CTC filter.` : ""}
          </p>
        </div>
      )}

      {visible.length === 0 && roleOpen && hasMustHaves ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 py-6">
          {suggested.length > 0 && hiddenByCtc > 0 ? "Everyone is hidden by the CTC filter. Widen the range or clear it." : "Nothing to show yet. Press Find matches to check the best candidates from your bank."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <Card key={m.candidateId} m={m} mandateId={mandateId} onChanged={() => router.refresh()} />
          ))}
        </ul>
      )}

      {weakCount > 0 && (
        <button onClick={() => setShowWeak((s) => !s)} className="mt-3 text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
          {showWeak ? "Hide" : "Show"} {weakCount} weak {weakCount === 1 ? "match" : "matches"}
        </button>
      )}

      {added.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-slate-700 dark:text-slate-200">Already added to the pipeline ({added.length})</summary>
          <ul className="mt-2 space-y-3">
            {added.map((m) => (
              <Card key={m.candidateId} m={m} mandateId={mandateId} onChanged={() => router.refresh()} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
