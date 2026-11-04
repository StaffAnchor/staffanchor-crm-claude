"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, LayoutGrid, List, MapPin, Rows3, Search } from "lucide-react";
import { toast } from "./toast";
import type { BoardCandidate, FeedbackValue, RoleBoard } from "./types";
import { columnOf, computeFit, type Column } from "./fit";
import { TABS, TAB_LOOK, tabOf, type Tab } from "./tabs";
import { statusOf, STATUS_NAME, type Status } from "./status";
import TabBanner from "./Insights";
import { LABEL, lakhLabel } from "./ui";
import CandidateCard from "./CandidateCard";
import ProfileCard from "./ProfileCard";
import CandidateDrawer from "./CandidateDrawer";
import type { OnePager } from "./onepager";
import { shortlistCsv } from "./exportSheet";

const COLUMNS: { key: Column; title: string; hint: string; dot: string }[] = [
  { key: "review", title: "To review", hint: "Waiting for your decision", dot: "bg-[#e8896a]" },
  { key: "interested", title: "Interested", hint: "You want to know more", dot: "bg-emerald-500" },
  { key: "interview", title: "Interview", hint: "Being scheduled or scheduled", dot: "bg-indigo-500" },
  { key: "closed", title: "Closed", hint: "Hired or passed", dot: "bg-slate-400" },
];

const budget = (min: unknown, max: unknown) => {
  const a = lakhLabel(min as number | string | null);
  const b = lakhLabel(max as number | string | null);
  return a && b ? `${a} – ${b}` : b ? `Up to ${b}` : a ? `${a}+` : null;
};

export default function RoleBoardView({
  board,
  onFeedback,
  getResumeUrl,
  getOnePager,
  backHref,
  banner,
}: {
  board: RoleBoard;
  onFeedback: (linkId: string, value: FeedbackValue, interviewAt?: string, extra?: { reason: string; note: string }) => Promise<void>;
  getResumeUrl?: (path: string) => Promise<string | null>;
  getOnePager?: (candidateId: string) => Promise<OnePager | null>;
  backHref?: string;
  banner?: React.ReactNode;
}) {
  const { role } = board;
  const [cands, setCands] = useState<BoardCandidate[]>(board.candidates);
  type View = "cards" | "board" | "list";
  const [view, setViewState] = useState<View>("cards");
  // Remember the last view in this browser (storage can be blocked, so every access is guarded); read after mount so the first paint matches the server.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("client-portal-view");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "cards" || saved === "board" || saved === "list") setViewState(saved);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      window.localStorage.setItem("client-portal-view", v);
    } catch {}
  };
  const [query, setQuery] = useState("");
  // Inside "Not moving forward": everyone, or only one kind.
  const [closedFilter, setClosedFilter] = useState<"all" | Extract<Status, "passed_cv" | "not_selected" | "withdrawn">>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  // Opens on what needs the client: the people waiting for a decision, or everyone when nothing is waiting.
  const [tab, setTab] = useState<Tab>(() => (board.candidates.some((c) => columnOf(c) === "review") ? "review" : "all"));

  async function handleFeedback(linkId: string, value: FeedbackValue, at?: string, extra?: { reason: string; note: string }) {
    const prev = cands;
    setCands((list) =>
      list.map((c) =>
        c.link_id !== linkId
          ? c
          : {
              ...c,
              client_feedback: value,
              client_pass_reason: value === "not_interested" ? extra?.reason ?? c.client_pass_reason : c.client_pass_reason,
              client_pass_note: value === "not_interested" ? extra?.note ?? c.client_pass_note : c.client_pass_note,
              stage: value === "interview_requested" ? "client_interview" : c.stage,
              requested_interview_at: value === "interview_requested" ? at ?? c.requested_interview_at : c.requested_interview_at,
            }
      )
    );
    try {
      await onFeedback(linkId, value, at, extra);
      toast.success(value === "interview_requested" ? "Interview request sent to your recruiter." : value === "interested" ? "Shortlisted." : "Passed on CV. You can reconsider later.");
    } catch (e) {
      setCands(prev);
      throw e;
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = cands.filter(
      (c) => (!q || c.full_name.toLowerCase().includes(q) || (c.current_job_title ?? "").toLowerCase().includes(q) || (c.current_employer ?? "").toLowerCase().includes(q)) && (view === "board" || tab === "all" || tabOf(c) === tab) && (view === "board" || tab !== "passed" || closedFilter === "all" || statusOf(c) === closedFilter)
    );
    return list
      .map((c) => ({ c, fit: computeFit(role, c) }))
      .sort((a, b) => (b.fit.pct ?? -1) - (a.fit.pct ?? -1))
      .map((x) => x.c);
  }, [cands, query, role, tab, view, closedFilter]);

  const byCol = (col: Column) => visible.filter((c) => columnOf(c) === col);
  const tabCounts: Record<Tab, number> = { review: 0, interested: 0, interview: 0, passed: 0, hired: 0, all: cands.length };
  for (const c of cands) tabCounts[tabOf(c)]++;
  const tabs = TABS.filter((t) => t.key !== "hired" || tabCounts.hired > 0);
  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[tabs.length - 1];
  const counts = {
    review: cands.filter((c) => columnOf(c) === "review").length,
    interested: cands.filter((c) => columnOf(c) === "interested").length,
    interview: cands.filter((c) => columnOf(c) === "interview").length,
    hired: cands.filter((c) => c.stage === "placed").length,
  };
  const ctcValues = cands.map((c) => Number(c.expected_fixed_ctc)).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  const median = ctcValues.length ? (ctcValues.length % 2 ? ctcValues[(ctcValues.length - 1) / 2] : (ctcValues[ctcValues.length / 2 - 1] + ctcValues[ctcValues.length / 2]) / 2) : null;
  const opened = cands.find((c) => c.link_id === openId) ?? null;

  const facts = [
    role.sub_domain && role.sub_domain,
    (role.cities?.length ? role.cities.join(", ") : role.city) && (
      <span key="c" className="inline-flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        {role.cities?.length ? role.cities.join(", ") : role.city}
      </span>
    ),
    role.experience_min !== null || role.experience_max !== null ? `${role.experience_min ?? 0}–${role.experience_max ?? "+"} yrs` : null,
    budget(role.budget_min, role.budget_max),
    role.work_mode,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      {banner}
      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> All your roles
        </Link>
      )}

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={LABEL}>Shortlist</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-slate-900">{role.role_title}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
            {facts.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {f}
              </span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("review")} className={`rounded-2xl border bg-white px-4 py-2.5 text-left transition hover:border-slate-300 ${tab === "review" && view !== "board" ? "border-slate-900 ring-1 ring-slate-900" : "border-[#ece7de]"}`}>
            <p className={LABEL}>New for you</p>
            <p className="font-mono text-[22px] font-semibold text-[#d9694a]">{counts.review}</p>
          </button>
          <button type="button" onClick={() => setTab("interested")} className={`rounded-2xl border bg-white px-4 py-2.5 text-left transition hover:border-slate-300 ${tab === "interested" && view !== "board" ? "border-slate-900 ring-1 ring-slate-900" : "border-[#ece7de]"}`}>
            <p className={LABEL}>Shortlisted</p>
            <p className="font-mono text-[22px] font-semibold text-slate-900">{counts.interested}</p>
          </button>
          <button type="button" onClick={() => setTab("interview")} className={`rounded-2xl border bg-white px-4 py-2.5 text-left transition hover:border-slate-300 ${tab === "interview" && view !== "board" ? "border-slate-900 ring-1 ring-slate-900" : "border-[#ece7de]"}`}>
            <p className={LABEL}>Interviewing</p>
            <p className="font-mono text-[22px] font-semibold text-slate-900">{counts.interview}</p>
          </button>
          {median !== null && (
            <div className="rounded-2xl border border-[#ece7de] bg-white px-4 py-2.5">
              <p className={LABEL}>Median expected</p>
              <p className="font-mono text-[22px] font-semibold text-slate-900">{lakhLabel(median)}</p>
            </div>
          )}
        </div>
      </div>

      {cands.length > 0 && view !== "board" && (
        <div className="mt-6 -mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Candidates by status">
          <div className="inline-flex min-w-full gap-1 border-b border-[#e3ddd1] sm:min-w-0">
            {tabs.map((t) => {
              const on = activeTab.key === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-[3px] px-4 py-2.5 text-[13.5px] font-semibold transition ${on ? `${TAB_LOOK[t.key].line} ${TAB_LOOK[t.key].ink}` : "border-transparent font-medium text-slate-500 hover:text-slate-800"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${TAB_LOOK[t.key].dot} ${on ? "" : "opacity-40"}`} />
                  {t.label}
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${on ? (t.key === "review" && tabCounts.review > 0 ? "bg-[#e8896a] text-white" : "bg-slate-900 text-white") : t.key === "review" && tabCounts.review > 0 ? "bg-[#fbe7df] text-[#c2553a]" : "bg-[#f1ece2] text-slate-500"}`}>{tabCounts[t.key]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {cands.length > 0 && view !== "board" && <TabBanner tab={activeTab.key} role={role} cands={cands} onOpen={setOpenId} />}

      {cands.length > 0 && view !== "board" && activeTab.key === "passed" && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by why they are not moving forward">
          {([["all", "All"], ["passed_cv", STATUS_NAME.passed_cv], ["not_selected", STATUS_NAME.not_selected], ["withdrawn", STATUS_NAME.withdrawn]] as const).map(([k, label]) => {
            const n = k === "all" ? tabCounts.passed : cands.filter((c) => statusOf(c) === k).length;
            return (
              <button key={k} type="button" onClick={() => setClosedFilter(k)} className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${closedFilter === k ? "border-slate-900 bg-slate-900 text-white" : "border-[#e3ddd1] bg-white text-slate-600 hover:border-slate-400"}`}>
                {label} <span className="font-mono">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, title or company"
            className="w-full rounded-xl border border-[#e3ddd1] bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const url = `https://jobs.staffanchor.com/client-portal/mandates/${role.id}`;
            const blob = new Blob([shortlistCsv(role, cands, url)], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${role.role_title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "shortlist"}-shortlist.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          disabled={cands.length === 0}
          title="Opens in Excel or Google Sheets"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#e3ddd1] bg-white px-3 py-2 text-[12.5px] font-medium text-slate-700 hover:bg-[#f4efe6] disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download spreadsheet
        </button>
        <div className="inline-flex rounded-xl border border-[#e3ddd1] bg-white p-0.5">
          {(["cards", "board", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium ${view === v ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-[#f4efe6]"}`}
            >
              {v === "cards" ? <Rows3 className="h-3.5 w-3.5" /> : v === "board" ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
              {v === "cards" ? "Cards" : v === "board" ? "Board" : "List"}
            </button>
          ))}
        </div>
        </div>
      </div>

      {cands.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d9d2c4] bg-white/60 px-6 py-16 text-center">
          <p className="text-[15px] font-medium text-slate-800">No candidates shortlisted yet</p>
          <p className="mt-1 text-[13px] text-slate-500">Your recruiter adds people here as soon as they have spoken to them. You will see why each one fits before you decide.</p>
        </div>
      ) : view === "cards" ? (
        <div className="mx-auto mt-5 max-w-5xl space-y-4">
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d9d2c4] bg-white/60 px-6 py-12 text-center text-[13.5px] text-slate-500">{query.trim() ? "No one matches that search." : activeTab.empty}</p>
          ) : (
            visible.map((c) => (
              <div key={c.link_id}>
                <ProfileCard role={role} c={c} onOpen={() => setOpenId(c.link_id)} getResumeUrl={getResumeUrl} onFeedback={handleFeedback} />
              </div>
            ))
          )}
        </div>
      ) : view === "board" ? (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = byCol(col.key);
            return (
              <div key={col.key} className="min-w-0 rounded-2xl bg-[#f3eee4]/70 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    <h2 className="text-[13px] font-semibold text-slate-800">{col.title}</h2>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] text-slate-500">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] text-slate-400">{col.hint}</p>
                  ) : (
                    items.map((c) => <CandidateCard key={c.link_id} role={role} c={c} onOpen={() => setOpenId(c.link_id)} getResumeUrl={getResumeUrl} onFeedback={handleFeedback} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-auto mt-5 max-w-3xl space-y-3">
          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#d9d2c4] bg-white/60 px-6 py-12 text-center text-[13.5px] text-slate-500">{query.trim() ? "No one matches that search." : activeTab.empty}</p>
          ) : (
            visible.map((c) => (
              <div key={c.link_id}>
                <CandidateCard role={role} c={c} onOpen={() => setOpenId(c.link_id)} getResumeUrl={getResumeUrl} onFeedback={handleFeedback} />
              </div>
            ))
          )}
        </div>
      )}

      {opened && <CandidateDrawer role={role} c={opened} onClose={() => setOpenId(null)} onFeedback={handleFeedback} getResumeUrl={getResumeUrl} getOnePager={getOnePager} />}
    </div>
  );
}
