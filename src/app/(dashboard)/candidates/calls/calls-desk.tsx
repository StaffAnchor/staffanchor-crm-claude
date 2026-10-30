"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Phone } from "lucide-react";
import ResumeViewerInline from "../[id]/resume-viewer-inline";
import { POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import CallRecordForm, { type CallResult } from "../call-record-form";


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
  reason: "call_back" | "interested" | "confirm_open" | "worth_a_call" | "pay_missing" | "details_missing" | "urgent_role";
  /** For an urgent role: which one, and how well they match it. */
  urgent_role?: { title: string; bucket: "perfect" | "close" } | null;
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
};

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
  urgent_role: { label: "Urgent role", cls: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100" },
  interested: { label: "Said yes to a role", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  call_back: { label: "Call back due", cls: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" },
  confirm_open: { label: "Strong, confirm they are looking", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" },
  worth_a_call: { label: "Qualify", cls: "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200" },
  pay_missing: { label: "Fill gaps", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
  details_missing: { label: "Fill gaps", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" },
};

// The critical details still missing, most important first: without current pay the top-tier ratio can't be worked out.
const gapsOf = (p: CallPerson) =>
  [!p.current_fixed_ctc && "current pay", !p.notice_period && "notice", !p.expected_fixed_ctc && "expected pay", !p.current_location && "city"].filter(Boolean) as string[];

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
export default function CallsDesk({ people }: { people: CallPerson[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(people[0]?.id ?? null);
  const [showList, setShowList] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState<CallResult | null>(null);
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

  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Nobody to call right now. Everyone worth calling has been reached, or is due later.
      </div>
    );
  }

  function finished(r: CallResult) {
    if (!active) return;
    setLast(r);
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
    <div className="grid gap-4 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,400px)_minmax(0,1fr)]">
      {/* Phone: a bar instead of the list. */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] lg:hidden dark:border-slate-700 dark:bg-slate-900">
        <button type="button" onClick={() => go(-1)} className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">Previous</button>
        <button type="button" onClick={() => setShowList((v) => !v)} className="font-medium text-teal-700 dark:text-teal-300">
          {index + 1} of {people.length} · {left} left {showList ? "▴" : "▾"}
        </button>
        <button type="button" onClick={() => go(1)} className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 dark:border-slate-600 dark:text-slate-200">Next</button>
      </div>
      <aside className={`${showList ? "block" : "hidden"} max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white lg:block lg:max-h-[78vh] dark:border-slate-700 dark:bg-slate-900`}>
        <p className="sticky top-0 border-b border-slate-100 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {left} left of {people.length}
        </p>
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(p.id);
                  setShowList(false);
                  setShowCv(false);
                }}
                className={`w-full border-b border-slate-100 px-3 py-2.5 text-left dark:border-slate-800 ${p.id === selected ? "bg-teal-50/70 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"} ${done[p.id] ? "opacity-50" : ""}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{p.full_name ?? "Unnamed"}</span>
                  {done[p.id] && <span className="shrink-0 text-[11px] font-medium text-emerald-700">{OUT[done[p.id]]}</span>}
                </span>
                <span className="block truncate text-[12px] text-slate-500">{[p.current_job_title, p.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</span>
                {(sourceOf(p) || p.profile_created_at) && (
                  <span className="block truncate text-[11.5px] text-slate-400">
                    {[sourceOf(p), p.profile_created_at ? `signed up ${new Date(p.profile_created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className={`mt-1 inline-block rounded px-1.5 py-px text-[11px] font-medium ${REASON[p.reason].cls}`}>
                  {p.reason === "interested" && p.interested_role ? `Said yes: ${p.interested_role}` : p.reason === "urgent_role" && p.urgent_role ? `Urgent: ${p.urgent_role.title} (${p.urgent_role.bucket === "perfect" ? "perfect" : "close"} match)` : REASON[p.reason].label}
                  {(p.reason === "pay_missing" || p.reason === "details_missing") && gapsOf(p).length > 0 && `: ${gapsOf(p).join(", ")}`}
                  {p.reason === "worth_a_call" && p.pay_ratio != null && ` · ratio ${Number(p.pay_ratio).toFixed(1)}`}
                </span>
                {p.tries > 0 && <span className="ml-1.5 text-[11px] text-slate-400">tried {p.tries}×</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {active ? (
        <>
          <section className="max-h-[78vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
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
                {last.summary && <p className="mt-0.5">{last.summary}</p>}
                {last.reading && <p className="mt-0.5">Your note is being read in the background; the details it fills and the client brief update within a minute.</p>}
                {last.filled.length > 0 && <p className="mt-0.5">Filled in: {last.filled.join(", ")}.</p>}
                {last.concerns.length > 0 && <p className="mt-0.5 text-amber-800 dark:text-amber-300">Concerns noted: {last.concerns.join("; ")}.</p>}
              </div>
            )}
            <CallRecordForm key={active.id} p={active} onDone={finished} mode="desk" />
          </section>

          <section className={`${showCv ? "block" : "hidden"} h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:col-span-2 ${cvOff ? "xl:hidden" : "xl:block"} xl:col-span-1 xl:h-[78vh] dark:border-slate-700 dark:bg-slate-900`}>
            {active.resume_file_url && activeCv ? (
              <div className="h-full overflow-auto">
                <ResumeViewerInline key={active.id} signedUrl={activeCv} fileName={active.resume_file_url.replace(/^resumes\//, "")} />
              </div>
            ) : active.resume_file_url && activeCv === undefined ? (
              <div className="flex h-full items-center justify-center text-[13px] text-slate-500">Opening the CV…</div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[13px] text-slate-500">
                <FileText className="h-8 w-8 text-slate-300" />
                No CV on file. Ask them to send it on WhatsApp after the call.
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="col-span-2 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-10 text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Done for today. Refresh for the next people due.
        </div>
      )}
    </div>
  );
}
