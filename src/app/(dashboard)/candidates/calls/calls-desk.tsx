"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Phone, Search } from "lucide-react";
import ResumeViewerInline from "../[id]/resume-viewer-inline";
import { POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import CallRecordForm, { type CallResult } from "../call-record-form";
import { GAP_LABEL, STRENGTH } from "@/lib/completion";
import StillMissing from "@/components/still-missing";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";


export type CallPerson = {
  id: string;
  full_name: string | null;
  phone: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  total_experience_years: number | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  current_location: string | null;
  open_to_relocation: string | null;
  work_mode: string | null;
  resume_file_url: string | null;
  resume_url?: string | null;
  pay_ratio: number | null;
  comm: string | null;
  open_fresh: boolean;
  reason: "call_back" | "interested" | "confirm_open" | "worth_a_call" | "pay_missing" | "details_missing" | "urgent_role" | "paid_call";
  /** For an urgent role: which one, and how well they match it. */
  urgent_role?: { title: string; bucket: "perfect" | "close" } | null;
  /** Paid ₹199 for a recruiter call on this role: the call is promised by this date. */
  paid_call?: { title: string; due: string | null } | null;
  interested_role?: string | null;
  tries: number;
  last_outcome: string | null;
  source?: string | null;
  profile_created_at?: string | null;
  profile_status?: string | null;
  current_employment_status?: string | null;
  highest_qualification?: string | null;
  role_level?: string | null;
  role_type?: string | null;
  email?: string | null;
  profile_group?: string | null;
  sub_domain?: string | null;
  /** Details still missing for this person (from the profile-completion list), as codes like current_ctc. */
  gaps?: string[];
  /** Profile strength (strong, good, weak, poor, unrated) and the plain-words reasons behind it. */
  strength?: string;
  why?: string[];
};



/** One call logged today, for the Today tab: who was called, how it went, and whether pay or a CV is still missing. */
export type CallHistoryRow = {
  id: string;
  candidate_id: string;
  full_name: string | null;
  phone: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  outcome: string;
  note: string | null;
  call_back_at: string | null;
  created_at: string;
  caller_id: string | null;
  caller_name: string | null;
  has_pay: boolean;
  has_cv: boolean;
  /** No-answer calls to this person in the last 14 days (they get 3 tries). */
  tries?: number;
};

/** Someone whose latest call ended with "call me back", with the time they asked for. */
export type CallBackRow = { candidate_id: string; full_name: string | null; phone: string | null; current_job_title: string | null; current_employer: string | null; call_back_at: string; asked_at: string; caller_name: string | null; note: string | null };

// Where someone stands after today's calls, in the words the recruiter uses.
type CalledState = "callback" | "partial" | "noanswer" | "done" | "closed";
const stateOf = (h: CallHistoryRow): CalledState => (h.outcome === "call_later" ? "callback" : h.outcome === "reached" ? (h.has_pay && h.has_cv ? "done" : "partial") : h.outcome === "no_answer" ? "noanswer" : "closed");
const STATES: { k: CalledState; title: string; short: string; hint: string; dot: string; bar: string; chip: string; avatar: string; tag: string }[] = [
  { k: "callback", title: "Asked to call back", short: "Call back", hint: "They move to the top of To call at the time they asked for.", dot: "bg-violet-500", bar: "border-l-violet-500", chip: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200", avatar: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100", tag: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100" },
  { k: "partial", title: "Spoke, pay or CV still missing", short: "Spoke, incomplete", hint: "Back on To call after 2 days, up to 3 conversations.", dot: "bg-amber-500", bar: "border-l-amber-500", chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200", avatar: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100", tag: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100" },
  { k: "noanswer", title: "Did not pick up", short: "No answer", hint: "Back on To call the next day, up to 3 tries.", dot: "bg-rose-500", bar: "border-l-rose-500", chip: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200", avatar: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100", tag: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" },
  { k: "done", title: "Gave pay and CV", short: "Done", hint: "Complete. Nothing more to do.", dot: "bg-emerald-500", bar: "border-l-emerald-500", chip: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200", avatar: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100", tag: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100" },
  { k: "closed", title: "Not interested or wrong number", short: "Closed", hint: "Off the call list.", dot: "bg-slate-400", bar: "border-l-slate-400", chip: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200", avatar: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", tag: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
];
// A job title short enough to sit on one line of a card.
const shortTitle = (t: string) => t.replace(/\bSenior\b/g, "Sr").replace(/\bExecutive\b/g, "Exec").replace(/\bManager\b/g, "Mgr").replace(/\bRepresentative\b/g, "Rep");
const initials = (n: string | null) => (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  const day = (x: Date) => x.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
  if (ms <= 0) return { text: "Due now", due: true };
  if (day(d) === day(new Date())) return { text: `Today ${time}`, due: false };
  if (day(d) === day(new Date(Date.now() + 86_400_000))) return { text: `Tomorrow ${time}`, due: false };
  return { text: `${d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} ${time}`, due: false };
};

const TIME = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const OUTCOME_LABEL: Record<string, string> = { reached: "Spoke", no_answer: "No answer", call_later: "Call back", not_interested: "Not interested", wrong_number: "Wrong number" };

// Where a profile came from, in words a recruiter can say to the person, and how long ago it was created.
const SOURCE_LABEL: Record<string, string> = { self_registration: "Registered on our site", quick_apply: "Quick apply on a job", bulk_import: "Imported from a CV", IIMJobs: "IIMJobs", Naukri: "Naukri", LinkedIn: "LinkedIn", Other: "Other source" };
const sourceOf = (p: CallPerson) => (p.source ? SOURCE_LABEL[p.source] ?? p.source.replace(/_/g, " ") : null);
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const createdOf = (p: CallPerson) => {
  if (!p.profile_created_at) return null;
  const d = new Date(p.profile_created_at);
  const n = daysSince(p.profile_created_at);
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} (${n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`})`;
};

const REASON: Record<CallPerson["reason"], { label: string; cls: string }> = {
  paid_call: { label: "Paid call", cls: "bg-teal-600 text-white" },
  urgent_role: { label: "Urgent role", cls: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100" },
  interested: { label: "Said yes to a role", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  call_back: { label: "Call back due", cls: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" },
  confirm_open: { label: "Strong, confirm they are looking", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
  worth_a_call: { label: "Qualify", cls: "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200" },
  pay_missing: { label: "Fill gaps", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  details_missing: { label: "Fill gaps", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
};

// What is still missing for this round of calls: current pay and the CV. Everything else is asked on the call form.
const gapsOf = (p: CallPerson) =>
  p.gaps ? p.gaps.filter((g) => g === "current_ctc" || g === "cv").map((g) => GAP_LABEL[g] ?? g) : ([!p.current_fixed_ctc && "current pay", !p.resume_file_url && "CV"].filter(Boolean) as string[]);

const tel = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 10 ? `+91${d}` : d ? `+${d}` : "";
};
const shownPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p ?? "No number";
};

// Works the same on a phone: the list folds away behind a bar with Previous / Next, the CV opens on a tap, and the number
// dials straight from the phone. On a laptop the number can be copied to dial from any phone.
export default function CallsDesk({ people: listed, history = [], callBacks = [], meId = null, openId = null, initialTab = "list" }: { people: CallPerson[]; history?: CallHistoryRow[]; callBacks?: CallBackRow[]; meId?: string | null; openId?: string | null; initialTab?: "list" | "today" | "backs" }) {
  const [done, setDone] = useState<Record<string, string>>({});
  // People opened from a search or from today's calls who are not on the list (for example someone who rang back).
  const [extra, setExtra] = useState<CallPerson[]>([]);
  const people = useMemo(() => [...extra, ...listed.filter((p) => !extra.some((e) => e.id === p.id))], [extra, listed]);
  const [tab, setTab] = useState<"list" | "today" | "backs">(initialTab);
  const [mineOnly, setMineOnly] = useState(true);
  const [calledFilter, setCalledFilter] = useState<CalledState | "all">("all");
  const [session, setSession] = useState<CallHistoryRow[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<CallPerson[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string | null>(listed[0]?.id ?? null);
  const [showList, setShowList] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState<CallResult | null>(null);
  const [lastPhone, setLastPhone] = useState<string | null>(null);
  const me = useMyFirstName();
  // CV links are fetched when a card opens and for the next card in advance (they used to be prepared for all fifty
  // people before the page could appear). The CV panel can also be switched off on a slower computer; that is remembered.
  const [cvUrls, setCvUrls] = useState<Record<string, string | null>>({});
  const [cvOff, setCvOff] = useState(false);
  useEffect(() => {
    let off = false;
    try {
      off = window.localStorage.getItem("calls-cv-off") === "1";
    } catch {
      /* storage can be blocked */
    }
    if (off) void Promise.resolve().then(() => setCvOff(true));
  }, []);
  const toggleCv = () => {
    setCvOff((v) => {
      try {
        window.localStorage.setItem("calls-cv-off", v ? "0" : "1");
      } catch {
        /* storage can be blocked */
      }
      return !v;
    });
  };
  const active = people.find((p) => p.id === selected) ?? null;
  const left = useMemo(() => people.filter((p) => !done[p.id]).length, [people, done]);
  const index = active ? people.findIndex((p) => p.id === active.id) : -1;
  const go = (step: number) => {
    if (index < 0) return;
    const next = people[(index + step + people.length) % people.length];
    setSelected(next.id);
    setShowCv(false);
  };

  const activeId = active?.id ?? null;
  const nextId = index >= 0 && people.length > 1 ? people[(index + 1) % people.length].id : null;
  useEffect(() => {
    for (const id of [activeId, nextId]) {
      if (!id || id in cvUrls) continue;
      if (!people.find((p) => p.id === id)?.resume_file_url) continue;
      fetch(`/api/calls/cv-url?id=${id}`)
        .then((r) => (r.ok ? r.json() : { url: null }))
        .then((d: { url: string | null }) => setCvUrls((m) => ({ ...m, [id]: d.url })))
        .catch(() => setCvUrls((m) => ({ ...m, [id]: null })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, nextId, cvOff]);
  const activeCv = activeId ? cvUrls[activeId] : null;

  const openPerson = (p: CallPerson) => {
    setExtra((e) => (people.some((x) => x.id === p.id) ? e : [p, ...e]));
    // A person already finished in this session can be called again, so clear the "done" mark.
    setDone((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== p.id)));
    setSelected(p.id);
    setShowList(false);
    setShowCv(false);
    setFound(null);
    setQ("");
  };
  // Picked from the caller lookup in the top bar: open that person straight away.
  useEffect(() => {
    if (!openId) return;
    let off = false;
    fetch(`/api/calls/lookup?id=${openId}`)
      .then((r) => r.json())
      .then((d: { people?: CallPerson[] }) => {
        const p = d.people?.[0];
        if (p && !off) openPerson(p);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  const search = async (text: string) => {
    setQ(text);
    if (text.trim().length < 3) {
      setFound(null);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/calls/lookup?q=${encodeURIComponent(text.trim())}`);
      const d = (await r.json()) as { people?: CallPerson[] };
      setFound(d.people ?? []);
    } catch {
      setFound([]);
    } finally {
      setSearching(false);
    }
  };
  const openFromHistory = async (h: { candidate_id: string; phone: string | null; full_name: string | null }) => {
    const here = people.find((p) => p.id === h.candidate_id);
    if (here) {
      setDone((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== here.id)));
      setSelected(here.id);
      setShowList(false);
      setShowCv(false);
      return;
    }
    const digits = (h.phone ?? "").replace(/\D/g, "").slice(-10);
    try {
      const r = await fetch(`/api/calls/lookup?q=${encodeURIComponent(digits || h.full_name || "")}`);
      const d = (await r.json()) as { people?: CallPerson[] };
      const p = (d.people ?? []).find((x) => x.id === h.candidate_id);
      if (p) openPerson(p);
    } catch {
      /* the person stays in the history; try again */
    }
  };
  // One line per person: their latest call today (earlier calls to the same person are folded in).
  const todayRows = useMemo(() => {
    const all = [...session, ...history].filter((h) => !(mineOnly && meId) || h.caller_id === meId);
    const seen = new Set<string>();
    return all.filter((h) => (seen.has(h.candidate_id) ? false : (seen.add(h.candidate_id), true)));
  }, [session, history, mineOnly, meId]);
  // A call-back made in this session is listed too; one that was redone is dropped.
  const backs = useMemo(() => {
    const redone = new Set(session.filter((h) => h.outcome !== "call_later").map((h) => h.candidate_id));
    const mine: CallBackRow[] = session.filter((h) => h.outcome === "call_later" && h.call_back_at).map((h) => ({ candidate_id: h.candidate_id, full_name: h.full_name, phone: h.phone, current_job_title: h.current_job_title, current_employer: h.current_employer, call_back_at: h.call_back_at as string, asked_at: h.created_at, caller_name: "You", note: null }));
    const ids = new Set(mine.map((b) => b.candidate_id));
    return [...mine, ...callBacks.filter((b) => !ids.has(b.candidate_id) && !redone.has(b.candidate_id))].sort((a, b) => a.call_back_at.localeCompare(b.call_back_at));
  }, [session, callBacks]);

  if (people.length === 0 && history.length === 0 && callBacks.length === 0 && session.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Nobody to call right now. Everyone worth calling has been reached, or is due later.
      </div>
    );
  }

  function finished(r: CallResult) {
    if (!active) return;
    setLast(r);
    setLastPhone(active.phone);
    setSession((l) => [
      { id: `s-${Date.now()}`, candidate_id: active.id, full_name: r.name || active.full_name, phone: active.phone, current_job_title: active.current_job_title, current_employer: active.current_employer, outcome: r.outcome, note: null, call_back_at: r.callBackAt ?? null, created_at: new Date().toISOString(), caller_id: meId, caller_name: "You", has_pay: !(r.stillMissing ?? []).includes("current_ctc"), has_cv: !!active.resume_file_url && !(r.stillMissing ?? []).includes("cv"), tries: r.outcome === "no_answer" ? active.tries + 1 : 0 },
      ...l,
    ]);
    const next = { ...done, [active.id]: r.outcome };
    setDone(next);
    const i = people.findIndex((p) => p.id === active.id);
    const after = [...people.slice(i + 1), ...people.slice(0, i)].find((p) => !next[p.id]);
    setSelected(after?.id ?? null);
    setShowCv(false);
    setCopied(false);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const OUT: Record<string, string> = { reached: "Spoke", no_answer: "No answer", call_later: "Call back", not_interested: "Not interested", wrong_number: "Wrong number" };

  return (
    <div className={`grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] ${active && !active.resume_file_url ? "xl:grid-cols-[330px_minmax(0,1fr)]" : "xl:grid-cols-[330px_minmax(0,400px)_minmax(0,1fr)]"}`}>
      {/* Phone: a bar instead of the list. */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] lg:hidden dark:border-slate-700 dark:bg-slate-900">
        <button type="button" onClick={() => go(-1)} className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">Previous</button>
        <button type="button" onClick={() => setShowList((v) => !v)} className="font-medium text-teal-700 dark:text-teal-300">
          {index + 1} of {people.length} · {left} left {showList ? "▴" : "▾"}
        </button>
        <button type="button" onClick={() => go(1)} className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">Next</button>
      </div>
      <aside className={`${showList ? "block" : "hidden"} max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white lg:sticky lg:top-3 lg:block lg:max-h-[calc(100vh-1.5rem)] lg:self-start dark:border-slate-700 dark:bg-slate-900`}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {([{ k: "list", l: "To call", n: left }, { k: "today", l: "Called", n: todayRows.length }, { k: "backs", l: "Call backs", n: backs.length }] as const).map((t) => (
              <button key={t.k} type="button" onClick={() => setTab(t.k)} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition ${tab === t.k ? "bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                {t.l}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${tab === t.k ? "bg-white/20 text-white dark:bg-slate-900/15 dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{t.n}</span>
              </button>
            ))}
          </div>
          <div className="relative border-t border-slate-100 px-2 py-1.5 dark:border-slate-800">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => void search(e.target.value)} placeholder="Someone rang? Number or name" inputMode="search" className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[12.5px] text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
          </div>
        </div>
        {found !== null ? (
          <ul>
            {searching && <li className="px-3 py-2 text-[12px] text-slate-400">Searching…</li>}
            {!searching && found.length === 0 && <li className="px-3 py-3 text-[12.5px] text-slate-500">No profile with that number or name.</li>}
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => openPerson(p)} className="w-full border-b border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <span className="block truncate text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{p.full_name ?? "Unnamed"}</span>
                  <span className="block truncate text-[12px] text-slate-500">{shownPhone(p.phone)} · {[p.current_job_title, p.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</span>
                  {p.last_outcome && <span className="block text-[11.5px] text-slate-400">Last call: {OUTCOME_LABEL[p.last_outcome] ?? p.last_outcome}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : tab === "backs" ? (
          <div className="px-2.5 py-2.5">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <header className="flex items-start justify-between gap-2 border-b border-l-4 border-slate-100 border-l-violet-500 px-3 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Asked to call back</h3>
                  <p className="text-[11.5px] leading-snug text-slate-500">At the time they asked for, they move to the top of To call.</p>
                </div>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">{backs.length}</span>
              </header>
              {backs.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px] text-slate-500">Nobody is waiting for a call back.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {backs.map((b) => {
                    const w = whenLabel(b.call_back_at);
                    return (
                      <li key={b.candidate_id}>
                        <button type="button" onClick={() => void openFromHistory(b)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11.5px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-100">{initials(b.full_name)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold capitalize text-slate-900 dark:text-slate-100">{(b.full_name ?? "Unnamed").toLowerCase()}</span>
                            <span className="block truncate text-[12px] text-slate-500">{shownPhone(b.phone)}{b.caller_name ? ` · asked ${b.caller_name}` : ""}</span>
                            <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${w.due ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-100" : "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-100"}`}>{w.due ? "Due now" : `Call back ${w.text}`}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : tab === "today" ? (
          <div className="pb-2">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <span className="text-[11.5px] font-medium text-slate-500">Calls today</span>
              {meId && (
                <span className="inline-flex rounded-full bg-slate-100 p-0.5 text-[11.5px] font-medium dark:bg-slate-800">
                  {([{ v: true, l: "Mine" }, { v: false, l: "Everyone" }] as const).map((o) => (
                    <button key={o.l} type="button" onClick={() => setMineOnly(o.v)} className={`rounded-full px-2.5 py-0.5 ${mineOnly === o.v ? "bg-white text-slate-900 shadow-sm dark:bg-slate-600 dark:text-white" : "text-slate-500"}`}>{o.l}</button>
                  ))}
                </span>
              )}
            </div>
            {todayRows.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-slate-500">No calls logged yet today.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
                  <button type="button" onClick={() => setCalledFilter("all")} className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${calledFilter === "all" ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}>All {todayRows.length}</button>
                  {STATES.map((st) => {
                    const n = todayRows.filter((h) => stateOf(h) === st.k).length;
                    if (n === 0) return null;
                    return (
                      <button key={st.k} type="button" onClick={() => setCalledFilter(calledFilter === st.k ? "all" : st.k)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${st.chip} ${calledFilter === st.k ? "ring-2 ring-slate-900/60 dark:ring-white/60" : ""}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.short} {n}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-3 px-2.5">
                  {STATES.filter((st) => calledFilter === "all" || calledFilter === st.k).map((st) => {
                    const rows = todayRows.filter((h) => stateOf(h) === st.k);
                    if (rows.length === 0) return null;
                    return (
                      <section key={st.k} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <header className={`flex items-start justify-between gap-2 border-b border-slate-100 border-l-4 px-3 py-2 dark:border-slate-800 ${st.bar}`}>
                          <div className="min-w-0">
                            <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{st.title}</h3>
                            <p className="text-[11.5px] leading-snug text-slate-500">{st.hint}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${st.tag}`}>{rows.length}</span>
                        </header>
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rows.map((h) => (
                            <li key={h.id}>
                              <button type="button" onClick={() => void openFromHistory(h)} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" title="Open this person again">
                                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${st.avatar}`}>{initials(h.full_name)}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-baseline justify-between gap-2">
                                    <span className="truncate text-[13.5px] font-semibold capitalize text-slate-900 dark:text-slate-100">{(h.full_name ?? "Unnamed").toLowerCase()}</span>
                                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{TIME(h.created_at)}</span>
                                  </span>
                                  <span className="block truncate text-[12px] text-slate-500">{shownPhone(h.phone)}{!mineOnly && h.caller_name ? ` · by ${h.caller_name}` : ""}</span>
                                  {st.k === "noanswer" && <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.tag}`}>{(h.tries ?? 1) >= 3 ? "3 tries, stopped" : `Try ${h.tries ?? 1} of 3 · next try tomorrow`}</span>}
                                  {st.k === "callback" && h.call_back_at && <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.tag}`}>Call back {whenLabel(h.call_back_at).text}</span>}
                                  {st.k === "partial" && <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.tag}`}>Still needs {[!h.has_pay && "current pay", !h.has_cv && "CV"].filter(Boolean).join(" + ")}</span>}
                                  {st.k === "closed" && <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${st.tag}`}>{h.outcome === "wrong_number" ? "Wrong number" : "Not interested"}</span>}
                                  {h.note && <span className="mt-1 block truncate text-[11.5px] italic text-slate-400">{h.note}</span>}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
        <div className="space-y-3 px-2.5 py-2.5">
          {([
            { k: "priority", title: "Priority", hint: "Paid calls, said yes to a role, call-backs due and urgent roles. Do these first.", bar: "border-l-teal-600", tag: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-100" },
            { k: "pay", title: "Missing current pay or CV", hint: "B2B first. Ask for what is missing; the form covers the rest.", bar: "border-l-amber-500", tag: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100" },
          ] as const).map((sec) => {
            const isPrio = (p: CallPerson) => p.reason !== "details_missing" && p.reason !== "pay_missing" && !extra.some((e) => e.id === p.id);
            const rows = people.filter((p) => (sec.k === "priority" ? isPrio(p) : !isPrio(p)));
            if (rows.length === 0) return null;
            return (
              <section key={sec.k} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <header className={`flex items-start justify-between gap-2 border-b border-l-4 border-slate-100 px-3 py-2 dark:border-slate-800 ${sec.bar}`}>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">{sec.title}</h3>
                    <p className="text-[11.5px] leading-snug text-slate-500">{sec.hint}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${sec.tag}`}>{rows.filter((p) => !done[p.id]).length}</span>
                </header>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(p.id);
                          setShowList(false);
                          setShowCv(false);
                        }}
                        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${p.id === selected ? "bg-teal-50 ring-2 ring-inset ring-teal-500 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"} ${done[p.id] ? "opacity-50" : ""}`}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold ${sec.tag}`}>{initials(p.full_name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[13.5px] font-semibold capitalize text-slate-900 dark:text-slate-100">{(p.full_name ?? "Unnamed").toLowerCase()}</span>
                            {done[p.id] ? <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">{OUT[done[p.id]]}</span> : p.tries > 0 ? <span className="shrink-0 text-[11px] text-slate-400">tried {p.tries}×</span> : null}
                          </span>
                          <span className="block truncate text-[12px] text-slate-500">{[p.current_job_title, p.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            {sec.k === "priority" && (
                              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${REASON[p.reason].cls}`}>
                                {p.reason === "interested" && p.interested_role ? `Said yes: ${p.interested_role}` : p.reason === "paid_call" && p.paid_call ? `Paid call · ${p.paid_call.title}${p.paid_call.due ? ` · by ${new Date(p.paid_call.due).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}` : ""}` : p.reason === "urgent_role" && p.urgent_role ? `Urgent · ${shortTitle(p.urgent_role.title)} · ${p.urgent_role.bucket === "perfect" ? "perfect" : "close"}` : REASON[p.reason].label}
                              </span>
                            )}
                            {gapsOf(p).map((g) => <span key={g} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">Needs {g}</span>)}
                            {p.strength && p.strength !== "unrated" && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STRENGTH[p.strength]?.cls ?? ""}`}>{STRENGTH[p.strength]?.label ?? p.strength}</span>}
                          </span>
                          {(sourceOf(p) || p.profile_created_at) && (
                            <span className="mt-1 block truncate text-[11px] text-slate-400">
                              {[sourceOf(p), p.profile_created_at ? `signed up ${new Date(p.profile_created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        )}
      </aside>

      {active ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">{active.full_name ?? "Unnamed"}</h2>
                <Link href={`/candidates/${active.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-teal-700 hover:underline dark:text-teal-300">
                  Profile <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <p className="text-[12.5px] text-slate-500">
                {[active.current_job_title, active.current_employer].filter(Boolean).join(" at ") || "Role not on file"}
                {active.total_experience_years ? ` · ${Number(active.total_experience_years)} yrs` : ""}
              </p>
              {active.strength && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className={`rounded px-2 py-0.5 font-semibold ${STRENGTH[active.strength]?.cls ?? ""}`}>Profile: {STRENGTH[active.strength]?.label ?? active.strength}</span>
                  {(active.why ?? []).map((w) => <span key={w} className="text-slate-500">{w}</span>)}
                  {active.strength === "unrated" && <span className="text-slate-500">Nothing to judge from yet: your call rating will set it.</span>}
                </p>
              )}
              {(sourceOf(active) || createdOf(active)) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                  {sourceOf(active) && <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">Source: {sourceOf(active)}</span>}
                  {createdOf(active) && <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">Profile created {createdOf(active)}</span>}
                  {active.profile_status && ["awaiting_input", "lead"].includes(active.profile_status) && <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Profile not complete</span>}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={`tel:${tel(active.phone)}`} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-teal-700">
                  <Phone className="h-4 w-4" /> {shownPhone(active.phone)}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(shownPhone(active.phone).replace(/\s/g, "")).then(() => setCopied(true));
                  }}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
                  title="Copy, then dial from any phone"
                >
                  {copied ? "Copied" : "Copy number"}
                </button>
                {active.resume_file_url && (
                  <button type="button" onClick={() => setShowCv((v) => !v)} className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 xl:hidden dark:border-slate-600 dark:text-slate-200">
                    {showCv ? "Hide CV" : "View CV"}
                  </button>
                )}
                {active.resume_file_url && (
                  <button type="button" onClick={toggleCv} className="hidden rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 xl:inline-block dark:border-slate-600 dark:text-slate-200" title="Turn the CV panel off if this page feels slow; it is remembered on this computer">
                    {cvOff ? "Show CV panel" : "Hide CV panel"}
                  </button>
                )}
              </div>
            </div>
            {last && (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                <p className="font-semibold">Saved {last.name}.{last.tier ? ` Talent Pool: ${POOL_TIER_LABEL[last.tier as PoolTier] ?? last.tier}.` : ""}</p>
                {last.outcome === "no_answer" && lastPhone && (
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <span>Didn&apos;t pick up. A WhatsApp lets them reply with their CV and pay:</span>
                    <WhatsAppMenu phone={lastPhone} templates={candidateTemplates(last.name, { me, candidateId: last.candidateId, missing: ["current_ctc", "cv"] }).filter((t) => ["tried", "cv", "details"].includes(t.key))} context={{ name: last.name }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-emerald-700" />
                  </p>
                )}
                {last.summary && <p className="mt-0.5">{last.summary}</p>}
                {last.reading && <p className="mt-0.5">Your note is being read in the background; the details it fills and the client brief update within a minute.</p>}
                {last.filled.length > 0 && <p className="mt-0.5">Filled in: {last.filled.join(", ")}.</p>}
                {last.stillMissing && <StillMissing name={last.name} candidateId={last.candidateId} gaps={last.stillMissing} />}
                {last.concerns.length > 0 && <p className="mt-0.5 text-amber-800 dark:text-amber-300">Concerns noted: {last.concerns.join("; ")}.</p>}
              </div>
            )}
            <CallRecordForm key={active.id} p={active} onDone={finished} mode="desk" />
          </section>

          {active.resume_file_url && (
          <section className={`${showCv ? "block" : "hidden"} h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:col-span-2 ${cvOff ? "xl:hidden" : "xl:block"} xl:sticky xl:top-3 xl:col-span-1 xl:h-[calc(100vh-1.5rem)] xl:self-start dark:border-slate-700 dark:bg-slate-900`}>
            {active.resume_file_url && activeCv ? (
              <div className="h-full overflow-auto">
                <ResumeViewerInline key={active.id} signedUrl={activeCv} fileName={active.resume_file_url.replace(/^resumes\//, "")} />
              </div>
            ) : active.resume_file_url && activeCv === undefined ? (
              <div className="flex h-full items-center justify-center text-[13px] text-slate-500">Opening the CV…</div>
            ) : null}
          </section>
          )}
        </>
      ) : (
        <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Done for today. Refresh for the next people due.
        </div>
      )}
    </div>
  );
}
