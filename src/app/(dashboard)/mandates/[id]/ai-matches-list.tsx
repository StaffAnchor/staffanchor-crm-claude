"use client";

import { useState } from "react";
import DismissReasons from "@/components/dismiss-reasons";
import Link from "next/link";
import ResumePreview from "../../candidates/[id]/resume-preview";
import WhatsAppMenu from "@/components/whatsapp-menu";
import PipelineTemplateActions from "./pipeline-template-actions";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, HelpCircle, X, ChevronDown } from "lucide-react";
import type { MatchChecks, ReqCheck } from "@/lib/ai-match";
import { BasisTag, ConfirmPanel, overlayCheck, useConfirmations } from "@/components/requirement-confirm";
import { ProfileRatingBadge, useProfileRatings } from "@/components/profile-rating";
import type { ProfileRatingRow } from "@/lib/profile-rating";

export type MatchItem = {
  candidateId: string;
  name: string;
  headline: string;
  years: number | null;
  location: string | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  notice: string | null;
  phone: string | null;
  readiness: number | null;
  missing: string[];
  resumeUrl: string | null;
  resumeName: string | null;
  elsewhere: { total: number; rejected: number };
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

// Best-effort days from free-text notice ("Immediate", "30 days", "2 months"); unknown sorts last.
function noticeDays(text: string | null): number {
  if (!text) return 9999;
  const t = text.toLowerCase();
  if (/immediate|available now|joins? now/.test(t) && !/\d/.test(t)) return 0;
  const n = t.match(/(\d+)/);
  if (!n) return 9999;
  const v = Number(n[1]);
  if (/month|mo\b/.test(t)) return v * 30;
  if (/week/.test(t)) return v * 7;
  return v;
}

function fmtCtc(v: number): string {
  return `${Number.isInteger(v) ? v : v.toFixed(1)} L`;
}


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

function Card({
  m,
  mandateId,
  onChanged,
  confirmations,
  rating,
  selected = false,
  onSelect,
  roleTitle = null,
}: {
  roleTitle?: string | null;
  m: MatchItem;
  mandateId: string;
  onChanged: () => void;
  confirmations: ReturnType<typeof useConfirmations>;
  rating?: ProfileRatingRow;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const me = useMyFirstName();
  const [open, setOpen] = useState(false);
  // Which requirement's "where did this come from / confirm it" panel is open.
  const [openReq, setOpenReq] = useState<string | null>(null);
  // Call-confirmed answers override what the AI read from the CV.
  const checks = {
    must: m.checks.must.map((c) => overlayCheck(c, m.candidateId, confirmations.map, "ai")),
    good: m.checks.good.map((c) => overlayCheck(c, m.candidateId, confirmations.map, "ai")),
  };
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reasonCodes, setReasonCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const f = FIT_STYLE[m.fit];
  const doubts = [...checks.must, ...checks.good].filter((c) => c.status !== "met");

  async function decide(action: "add" | "dismiss") {
    setBusy(action);
    setError(null);
    const res = await fetch(`/api/mandates/${mandateId}/ai-match/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: m.candidateId, action, reasonCodes: action === "dismiss" ? reasonCodes : undefined }),
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
            {onSelect && m.status !== "added" && (
              <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${m.name}`} className="h-4 w-4" />
            )}
            <Link href={`/candidates/${m.candidateId}`} className="text-[14px] font-semibold text-blue-700 dark:text-blue-400 hover:underline">
              {m.name}
            </Link>
            <ProfileRatingBadge row={rating} />
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
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            <span className={m.notice ? "" : "text-amber-700 dark:text-amber-300"}>{m.notice ? `Notice ${m.notice}` : "Notice: not given"}</span>
            {m.readiness != null && <span title="How complete this profile is"> · Profile {m.readiness}/100</span>}
          </p>
          {m.elsewhere.total > 0 && (
            <p className="text-[12px] text-violet-700 dark:text-violet-300">
              Also in {m.elsewhere.total} other {m.elsewhere.total === 1 ? "pipeline" : "pipelines"}
              {m.elsewhere.rejected > 0 ? ` (rejected in ${m.elsewhere.rejected})` : ""}
            </p>
          )}
        </div>
        {m.status === "added" ? (
          <span className="shrink-0 text-[12px] font-medium text-emerald-700 dark:text-emerald-300">In pipeline</span>
        ) : (
          <div className="shrink-0 flex items-center gap-2">
            {m.resumeUrl && <ResumePreview signedUrl={m.resumeUrl} fileName={(m.resumeName ?? `${m.name}-resume`).replace(/^resumes\//, "")} label="CV" />}
            <WhatsAppMenu
              phone={m.phone}
              templates={candidateTemplates(m.name, { me, candidateId: m.candidateId, missing: m.missing, role: roleTitle }).filter((t) => t.key !== "intro")}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-800"
            />
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
        {checks.must.map((c, i) => (
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

      {dismissing && <DismissReasons value={reasonCodes} onChange={setReasonCodes} onConfirm={() => decide("dismiss")} busy={busy !== null} />}
      <div className="mt-2">
        <PipelineTemplateActions candidateId={m.candidateId} mandateId={mandateId} missing={m.missing} showOpportunity />
      </div>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

      {doubts.some((d) => d.question) && (
        <button
          onClick={async () => {
            const qs = doubts.filter((d) => d.question).map((d, i) => `${i + 1}. ${d.question}`).join("\n");
            try {
              await navigator.clipboard.writeText(`Questions for ${m.name}:\n${qs}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked: nothing to do */
            }
          }}
          className="mt-2 mr-3 inline-flex items-center gap-1 text-[12px] font-medium text-indigo-700 dark:text-indigo-300 hover:underline"
        >
          {copied ? "Copied" : "Copy the questions to ask"}
        </button>
      )}
      <button onClick={() => setOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide" : "Show"} evidence{doubts.length > 0 ? ` and ${doubts.length} to confirm` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[12.5px]">
          {([
            ["Must haves", checks.must],
            ["Good to haves", checks.good],
          ] as const).map(([title, list]) =>
            list.length === 0 ? null : (
              <div key={title}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">{title}</p>
                <ul className="space-y-1.5">
                  {list.map((c, i) => (
                    <li key={i} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2">
                      <StatusIcon s={c.status} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setOpenReq((cur) => (cur === `${title}::${i}` ? null : `${title}::${i}`))}
                          className="flex flex-wrap items-center gap-2 text-left text-slate-800 hover:underline dark:text-slate-200"
                          title="Click to see where this came from or record a call answer"
                        >
                          {c.requirement} <BasisTag basis={c.basis} />
                        </button>
                        {c.evidence && <p className="text-slate-500 dark:text-slate-400">{c.evidence}</p>}
                        {c.question && c.basis !== "confirmed" && <p className="text-amber-800 dark:text-amber-300">Ask: {c.question}</p>}
                        {openReq === `${title}::${i}` && (
                          <div className="mt-1.5">
                            <ConfirmPanel
                              candidateId={m.candidateId}
                              requirement={c.requirement}
                              evidence={c.evidence}
                              basis={c.basis}
                              question={c.question}
                              confirmations={confirmations}
                            />
                          </div>
                        )}
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
  roleTitle = null,
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
  roleTitle?: string | null;
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
  const [sortBy, setSortBy] = useState<"best" | "ctc" | "notice">("best");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const confirmations = useConfirmations(mandateId);
  const ratings = useProfileRatings();
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
  // Weak CVs (as marked by the team) stay hidden with the weak matches; strong CVs lead within their fit.
  const isWeakCv = (i: MatchItem) => ratings.get(i.candidateId)?.rating === "weak";
  const strongRank = (i: MatchItem) => (ratings.get(i.candidateId)?.rating === "strong" ? 0 : 1);
  const cmpBest = (a: MatchItem, b: MatchItem) => order[a.fit] - order[b.fit] || strongRank(a) - strongRank(b) || b.score - a.score;
  const visible = afterCtc(suggested.filter((i) => showWeak || (i.fit !== "weak" && !isWeakCv(i)))).sort((a, b) => {
    if (sortBy === "ctc") return (a.expectedCtc ?? a.currentCtc ?? 9999) - (b.expectedCtc ?? b.currentCtc ?? 9999) || cmpBest(a, b);
    if (sortBy === "notice") return noticeDays(a.notice) - noticeDays(b.notice) || cmpBest(a, b);
    return cmpBest(a, b);
  });
  const weakCount = suggested.filter((i) => i.fit === "weak" || isWeakCv(i)).length;
  const hiddenByCtc = suggested.filter((i) => (showWeak || i.fit !== "weak") && !passesCtc(i)).length;
  const noCtcCount = suggested.filter((i) => ctcFor(i, ctcBasis) == null).length;

  function togglePick(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Add every ticked person to the pipeline, one after another, then refresh once.
  async function addPicked() {
    const ids = visible.filter((i) => picked.has(i.candidateId)).map((i) => i.candidateId);
    if (ids.length === 0) return;
    if (!window.confirm(`Add ${ids.length} ${ids.length === 1 ? "person" : "people"} to this role's pipeline?`)) return;
    setBulkBusy(true);
    setError(null);
    let ok = 0;
    for (const id of ids) {
      const res = await fetch(`/api/mandates/${mandateId}/ai-match/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: id, action: "add" }) });
      if (res.ok) ok++;
    }
    setBulkBusy(false);
    setPicked(new Set());
    setMessage(`Added ${ok} of ${ids.length} to the pipeline.`);
    router.refresh();
  }

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
            {lastRunAt ? ` Last checked ${new Date(lastRunAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}.` : ""}
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

      {visible.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-slate-300">
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "best" | "ctc" | "notice")} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-[12.5px]">
              <option value="best">Best fit first</option>
              <option value="ctc">Lowest expected CTC</option>
              <option value="notice">Shortest notice</option>
            </select>
          </label>
          <div className="flex items-center gap-3 text-[12.5px]">
            <button onClick={() => setPicked(new Set(visible.map((i) => i.candidateId)))} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              Select all {visible.length}
            </button>
            {picked.size > 0 && (
              <>
                <button onClick={() => setPicked(new Set())} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
                  Clear
                </button>
                <button onClick={addPicked} disabled={bulkBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-800 disabled:opacity-60">
                  {bulkBusy && <Loader2 className="h-3 w-3 animate-spin" />} Add selected ({picked.size})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {visible.length === 0 && roleOpen && hasMustHaves ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400 py-6">
          {suggested.length > 0 && hiddenByCtc > 0 ? "Everyone is hidden by the CTC filter. Widen the range or clear it." : "Nothing to show yet. Press Find matches to check the best candidates from your bank."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((m) => (
            <Card key={m.candidateId} roleTitle={roleTitle} m={m} mandateId={mandateId} confirmations={confirmations} rating={ratings.get(m.candidateId)} onChanged={() => router.refresh()} selected={picked.has(m.candidateId)} onSelect={(on) => togglePick(m.candidateId, on)} />
          ))}
        </ul>
      )}

      {weakCount > 0 && (
        <button onClick={() => setShowWeak((s) => !s)} className="mt-3 text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
          {showWeak ? "Hide" : "Show"} {weakCount} weak {weakCount === 1 ? "match or profile" : "matches or profiles"}
        </button>
      )}

      {added.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-slate-700 dark:text-slate-200">Already added to the pipeline ({added.length})</summary>
          <ul className="mt-2 space-y-3">
            {added.map((m) => (
              <Card key={m.candidateId} roleTitle={roleTitle} m={m} mandateId={mandateId} confirmations={confirmations} rating={ratings.get(m.candidateId)} onChanged={() => router.refresh()} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
