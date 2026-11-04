"use client";

import { CalendarClock, CheckCircle2, Clock, Sparkles, ThumbsDown, TrendingUp, UserCheck } from "lucide-react";
import type { BoardCandidate, Role } from "./types";
import { computeFit } from "./fit";
import { PASS_REASONS, passReasonLabel } from "./PassReasonDialog";
import { TAB_LOOK, TABS, tabOf, type Tab } from "./tabs";
import { statusOf } from "./status";
import { LABEL, formatSlot, lakhLabel } from "./ui";

// What the client sees under the tabs. Every number and sentence is read from the shortlist itself (decisions, pass reasons, fit,
// pay against the budget, dates): nothing is estimated or made up. The "Insights" tab gives the overall picture; each other tab opens
// with a banner of its own so the open tab is obvious and says what it holds.

const PALETTE = ["#e8896a", "#4f46e5", "#059669", "#d97706", "#0ea5e9", "#a855f7", "#64748b", "#e11d48", "#14b8a6", "#84cc16", "#f59e0b", "#94a3b8"];
const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#ece7de] bg-white p-4 ${className}`}>
      <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ---- Charts ---------------------------------------------------------------------------------------------------------------

function Funnel({ cands }: { cands: BoardCandidate[] }) {
  const t = (k: Exclude<Tab, "all">) => cands.filter((c) => tabOf(c) === k).length;
  const hired = t("hired");
  const interview = t("interview") + hired;
  const interested = t("interested") + interview;
  const decided = cands.length - t("review");
  const steps = [
    { label: "Shared with you", n: cands.length, color: "#cbd5e1" },
    { label: "You decided on", n: decided, color: "#94a3b8" },
    { label: "Shortlisted", n: interested, color: "#059669" },
    { label: "Interviewing", n: interview, color: "#4f46e5" },
    { label: "Selected", n: hired, color: "#d97706" },
  ];
  const max = Math.max(1, cands.length);
  return (
    <ul className="space-y-2.5" aria-label="Shortlist funnel">
      {steps.map((s, i) => (
        <li key={s.label}>
          <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
            <span className="text-slate-700">{s.label}</span>
            <span className="font-mono text-slate-900">
              {s.n}
              {i > 0 && steps[i - 1].n > 0 && <span className="ml-1.5 text-[11px] text-slate-400">{Math.round((s.n / steps[i - 1].n) * 100)}%</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#f1ece2]">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.n / max) * 100}%`, background: s.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

type Reason = { value: string; label: string; n: number; color: string };

export function passReasons(passed: BoardCandidate[]): Reason[] {
  const counts = new Map<string, number>();
  for (const c of passed) counts.set(c.client_pass_reason || "none", (counts.get(c.client_pass_reason || "none") ?? 0) + 1);
  const list = [...counts.entries()]
    .map(([value, n]) => ({ value, n, label: value === "none" ? "No reason given" : passReasonLabel(value) ?? "Other" }))
    .sort((a, b) => b.n - a.n || PASS_REASONS.findIndex((r) => r.value === a.value) - PASS_REASONS.findIndex((r) => r.value === b.value));
  return list.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length] }));
}

function Donut({ reasons, total }: { reasons: Reason[]; total: number }) {
  const R = 42;
  const C = 2 * Math.PI * R;
  const starts = reasons.map((_, i) => reasons.slice(0, i).reduce((a, r) => a + (r.n / Math.max(1, total)) * C, 0));
  return (
    <div className="relative h-[120px] w-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Passes by reason">
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1ece2" strokeWidth="14" />
        {reasons.map((r, i) => {
          const len = (r.n / Math.max(1, total)) * C;
          return <circle key={r.value} cx="60" cy="60" r={R} fill="none" stroke={r.color} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-starts[i]} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[24px] font-semibold leading-none text-slate-900">{total}</span>
        <span className="mt-0.5 text-[10.5px] uppercase tracking-wider text-slate-500">passed</span>
      </div>
    </div>
  );
}

function ReasonBreakdown({ passed }: { passed: BoardCandidate[] }) {
  const reasons = passReasons(passed);
  if (passed.length === 0) return <p className="text-[13px] text-slate-500">You have not passed on anyone yet. When you do, the reasons are broken down here.</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <Donut reasons={reasons} total={passed.length} />
      <ul className="min-w-[220px] flex-1 space-y-2">
        {reasons.map((r) => (
          <li key={r.value}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="flex min-w-0 items-center gap-2 text-slate-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="shrink-0 font-mono text-slate-900">
                {r.n}
                <span className="ml-1.5 text-[11px] text-slate-400">{Math.round((r.n / passed.length) * 100)}%</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f1ece2]">
              <div className="h-full rounded-full" style={{ width: `${(r.n / passed.length) * 100}%`, background: r.color }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TONES: { key: "strong" | "good" | "mixed" | "weak" | "none"; label: string; color: string }[] = [
  { key: "strong", label: "Strong", color: "#059669" },
  { key: "good", label: "Good", color: "#4f46e5" },
  { key: "mixed", label: "Partial", color: "#d97706" },
  { key: "weak", label: "Weak", color: "#94a3b8" },
  { key: "none", label: "Not enough data", color: "#e2ddd2" },
];

function FitSpread({ role, cands }: { role: Role; cands: BoardCandidate[] }) {
  const fits = cands.map((c) => computeFit(role, c));
  const counts = TONES.map((t) => ({ ...t, n: fits.filter((f) => f.tone === t.key).length })).filter((t) => t.n > 0);
  return (
    <div>
      <div className="flex h-3.5 overflow-hidden rounded-full bg-[#f1ece2]" role="img" aria-label="Spread of match strength">
        {counts.map((t) => <div key={t.key} style={{ width: `${(t.n / Math.max(1, cands.length)) * 100}%`, background: t.color }} title={`${t.label}: ${t.n}`} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        {counts.map((t) => (
          <li key={t.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
            {t.label} <span className="font-mono text-slate-900">{t.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOT: Record<Exclude<Tab, "all">, string> = { review: "#e8896a", interested: "#059669", interview: "#4f46e5", passed: "#e11d48", hired: "#d97706" };

function PayVsBudget({ role, cands }: { role: Role; cands: BoardCandidate[] }) {
  const pts = cands.map((c) => ({ c, v: num(c.expected_fixed_ctc) })).filter((p): p is { c: BoardCandidate; v: number } => p.v !== null && p.v > 0);
  const bMin = num(role.budget_min);
  const bMax = num(role.budget_max);
  if (pts.length === 0) return <p className="text-[13px] text-slate-500">Expected pay is not available for these candidates yet.</p>;
  const values = [...pts.map((p) => p.v), ...(bMin !== null ? [bMin] : []), ...(bMax !== null ? [bMax] : [])];
  const lo = Math.floor(Math.min(...values) - 2);
  const hi = Math.ceil(Math.max(...values) + 2);
  const x = (v: number) => 12 + ((v - lo) / Math.max(1, hi - lo)) * 376;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round(lo + ((hi - lo) * i) / 4));
  const above = bMax !== null ? pts.filter((p) => p.v > bMax).length : 0;
  return (
    <div>
      <svg viewBox="0 0 400 96" className="w-full" role="img" aria-label="Expected pay against your budget">
        {bMin !== null || bMax !== null ? (
          <>
            <rect x={x(bMin ?? lo)} y="14" width={Math.max(2, x(bMax ?? hi) - x(bMin ?? lo))} height="44" rx="8" fill="#e7f3ee" stroke="#a7d8c3" />
            <text x={x(bMin ?? lo) + 6} y="11" fontSize="9" fill="#059669" fontFamily="monospace">YOUR BUDGET</text>
          </>
        ) : null}
        <line x1="12" y1="66" x2="388" y2="66" stroke="#e3ddd1" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1="66" x2={x(t)} y2="70" stroke="#cbd5e1" />
            <text x={x(t)} y="84" fontSize="9" textAnchor="middle" fill="#94a3b8" fontFamily="monospace">₹{t}L</text>
          </g>
        ))}
        {pts.map((p, i) => (
          <circle key={p.c.link_id} cx={x(p.v)} cy={26 + (i % 3) * 13} r="6" fill={DOT[tabOf(p.c)]} fillOpacity="0.9" stroke="#fff" strokeWidth="1.5">
            <title>{`${p.c.full_name}: ${lakhLabel(p.v)} expected`}</title>
          </circle>
        ))}
      </svg>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
        {(["review", "interested", "interview", "passed", "hired"] as const).filter((k) => pts.some((p) => tabOf(p.c) === k)).map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: DOT[k] }} />
            {TABS.find((t) => t.key === k)?.label}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[12px] text-slate-500">
        {bMax !== null ? (above === 0 ? "Everyone expects pay within your budget." : `${plural(above, "candidate")} expect${above === 1 ? "s" : ""} more than ${lakhLabel(bMax)}.`) : "Each dot is a candidate's expected pay."}
      </p>
    </div>
  );
}

// ---- Insight sentences, computed from the decisions --------------------------------------------------------------------------

function avgFit(role: Role, list: BoardCandidate[]): number | null {
  const v = list.map((c) => computeFit(role, c).pct).filter((p): p is number => p !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function Insight({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl bg-[#f7f3ea] px-3 py-2.5 text-[12.5px] leading-5 text-slate-700">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#d9694a]" />
      <span>{children}</span>
    </p>
  );
}

// ---- The banner under the tabs ----------------------------------------------------------------------------------------------

export default function TabBanner({ tab, role, cands, onOpen }: { tab: Tab; role: Role; cands: BoardCandidate[]; onOpen: (linkId: string) => void }) {
  const look = TAB_LOOK[tab];
  const label = TABS.find((t) => t.key === tab)?.label ?? "";
  const of = (k: Exclude<Tab, "all">) => cands.filter((c) => tabOf(c) === k);

  const head = (icon: React.ReactNode, title: string, sub: string, right?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white ${look.ink}`}>{icon}</span>
        <div>
          <p className={`${LABEL} !text-[10px]`}>{label}</p>
          <h2 className={`text-[17px] font-semibold ${look.ink}`}>{title}</h2>
          <p className="mt-0.5 max-w-xl text-[12.5px] text-slate-600">{sub}</p>
        </div>
      </div>
      {right}
    </div>
  );

  let body: React.ReactNode = null;
  let top: React.ReactNode = null;

  if (tab === "review") {
    const waiting = of("review").map((c) => ({ c, fit: computeFit(role, c), days: daysAgo(c.shortlisted_at) }));
    const best = [...waiting].sort((a, b) => (b.fit.pct ?? -1) - (a.fit.pct ?? -1))[0];
    const oldest = waiting.reduce<number>((m, w) => Math.max(m, w.days ?? 0), 0);
    top = head(
      <Clock className="h-[18px] w-[18px]" />,
      waiting.length === 0 ? "You are all caught up" : `${plural(waiting.length, "candidate")} waiting for you`,
      waiting.length === 0 ? "Every candidate has your decision. New ones appear here as soon as your recruiter shares them." : `Take a minute on each: Shortlist, Interview or Pass. ${oldest >= 2 ? `The longest has been waiting ${oldest} days.` : "All were shared in the last couple of days."}`,
      best && best.fit.pct !== null && waiting.length > 1 ? (
        <button type="button" onClick={() => onOpen(best.c.link_id)} className="rounded-xl border border-[#e8c9bd] bg-white px-3 py-2 text-left hover:bg-[#fff8f5]">
          <span className={`${LABEL} !text-[10px]`}>Strongest match waiting</span>
          <span className="mt-0.5 block text-[13px] font-semibold text-slate-900">{best.c.full_name} <span className="font-mono text-emerald-700">{best.fit.pct}%</span></span>
        </button>
      ) : null
    );
  } else if (tab === "interested") {
    const list = of("interested");
    top = head(<UserCheck className="h-[18px] w-[18px]" />, list.length === 0 ? "No one shortlisted yet" : `${plural(list.length, "candidate")} you shortlisted`, "Ready for the next step? Press Interview on a card and your recruiter schedules it with the candidate.");
    body = list.length > 0 && (
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <button key={c.link_id} type="button" onClick={() => onOpen(c.link_id)} className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[12.5px] font-medium text-emerald-800 hover:bg-emerald-50">
            {c.full_name}
          </button>
        ))}
      </div>
    );
  } else if (tab === "interview") {
    const list = of("interview").map((c) => ({ c, at: c.confirmed_interview_at ?? c.requested_interview_at, confirmed: !!c.confirmed_interview_at })).sort((a, b) => (a.at ?? "9").localeCompare(b.at ?? "9"));
    top = head(<CalendarClock className="h-[18px] w-[18px]" />, list.length === 0 ? "No interviews yet" : `${plural(list.length, "interview")} in motion`, "Confirmed slots are final. Requested slots are waiting for your recruiter to confirm with the candidate.");
    body = list.length > 0 && (
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {list.map(({ c, at, confirmed }) => (
          <li key={c.link_id}>
            <button type="button" onClick={() => onOpen(c.link_id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-3 py-2.5 text-left hover:bg-indigo-50/60">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-slate-900">{c.full_name}</span>
                <span className="block truncate text-[12px] text-slate-500">{at ? formatSlot(at) : "Time to be set"}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{confirmed ? "Confirmed" : "Requested"}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (tab === "passed") {
    const everyone = of("passed");
    const list = everyone.filter((c) => statusOf(c) === "passed_cv");
    const afterInterview = everyone.filter((c) => statusOf(c) === "not_selected").length;
    const reasons = passReasons(list);
    const topReason = reasons.find((r) => r.value !== "none");
    const interestedFit = avgFit(role, [...of("interested"), ...of("interview"), ...of("hired")]);
    const passedFit = avgFit(role, list);
    top = head(<ThumbsDown className="h-[18px] w-[18px]" />, everyone.length === 0 ? "No one has left the process" : `${plural(everyone.length, "candidate")} not moving forward`, `${list.length} passed on the CV${afterInterview ? `, ${afterInterview} not selected after an interview` : ""}. Why you passed, in your own words, sharpens every shortlist we send you next.`);
    body = (
      <div className="mt-4 space-y-3">
        {list.length > 0 && (
          <div className="rounded-2xl bg-white p-4">
            <ReasonBreakdown passed={list} />
          </div>
        )}
        {topReason && list.length >= 2 && (
          <Insight>
            <b>{Math.round((topReason.n / list.length) * 100)}% of your passes</b> were for &ldquo;{topReason.label.toLowerCase()}&rdquo;. We use this to sharpen the next shortlist.
            {interestedFit !== null && passedFit !== null && ` The people you chose to pursue average a ${interestedFit}% match, against ${passedFit}% for those you passed.`}
          </Insight>
        )}
      </div>
    );
  } else if (tab === "hired") {
    const list = of("hired");
    top = head(<CheckCircle2 className="h-[18px] w-[18px]" />, `${plural(list.length, "selected candidate")}`, "Congratulations. Your recruiter will stay in touch through joining.");
  } else {
    const interestedAll = of("interested").length + of("interview").length + of("hired").length;
    const decided = cands.length - of("review").length;
    const budgetMax = num(role.budget_max);
    const exp = cands.map((c) => num(c.expected_fixed_ctc)).filter((n): n is number => n !== null && n > 0).sort((a, b) => a - b);
    const med = exp.length ? (exp.length % 2 ? exp[(exp.length - 1) / 2] : (exp[exp.length / 2 - 1] + exp[exp.length / 2]) / 2) : null;
    top = head(
      <TrendingUp className="h-[18px] w-[18px]" />,
      "The whole shortlist at a glance",
      `${plural(cands.length, "candidate")} shared. You decided on ${decided}${decided ? `, and ${interestedAll} of them moved forward` : ""}.`,
      <div className="flex flex-wrap gap-2 text-[12px] text-slate-600">
        {med !== null && <span className="rounded-full bg-white px-3 py-1">Median expected <b className="font-mono text-slate-900">{lakhLabel(med)}</b>{budgetMax !== null && <> vs budget up to <b className="font-mono text-slate-900">{lakhLabel(budgetMax)}</b></>}</span>}
      </div>
    );
    body = (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel title="Where candidates stand" sub="From shared to hired">
          <Funnel cands={cands} />
        </Panel>
        <Panel title="Why you passed on CVs" sub={cands.some((c) => statusOf(c) === "passed_cv") ? "Reasons you gave" : "No passes yet"}>
          <ReasonBreakdown passed={cands.filter((c) => statusOf(c) === "passed_cv")} />
        </Panel>
        <Panel title="How well they match your brief" sub="Everything you asked for, scored on the candidate's profile and your recruiter's review">
          <FitSpread role={role} cands={cands} />
        </Panel>
        <Panel title="Expected pay against your budget">
          <PayVsBudget role={role} cands={cands} />
        </Panel>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label={look.title} className={`mt-4 rounded-2xl border-l-4 ${look.line} ${look.soft} p-4 sm:p-5`}>
      {top}
      {body}
    </div>
  );
}
