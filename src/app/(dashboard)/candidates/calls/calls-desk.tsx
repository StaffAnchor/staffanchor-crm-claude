"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, ExternalLink, FileText, Phone } from "lucide-react";
import { cityOptions, fixedCtcOptions, noticePeriodOptions, relocationOptions, workModeOptions } from "@/lib/candidate-options";
import ResumeViewerInline from "../[id]/resume-viewer-inline";

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
  reason: "call_back" | "confirm_open" | "worth_a_call" | "pay_missing" | "details_missing";
  tries: number;
  last_outcome: string | null;
};

const REASON: Record<CallPerson["reason"], { label: string; cls: string }> = {
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

// IST 11:00 on a day N days from now, as an ISO time.
function callBackAt(days: number): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 11, 0) - 5.5 * 3_600_000).toISOString();
}

function Chips({ value, options, onChange, tone }: { value: string; options: { v: string; label: string }[]; onChange: (v: string) => void; tone?: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(value === o.v ? "" : o.v)}
          className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
            value === o.v ? tone?.(o.v) ?? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, missing, children }: { label: string; missing?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
        {label}
        {missing && <span className="rounded bg-amber-100 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">ask</span>}
      </p>
      {children}
    </div>
  );
}

const asOpts = (xs: string[]) => xs.map((x) => ({ v: x, label: x }));
const select = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900";

function CallForm({ p, onDone }: { p: CallPerson; onDone: (outcome: string) => void }) {
  const [ctc, setCtc] = useState(p.current_fixed_ctc ? String(Number(p.current_fixed_ctc)) : "");
  const [expected, setExpected] = useState(p.expected_fixed_ctc ? String(Number(p.expected_fixed_ctc)) : "");
  const [notice, setNotice] = useState(p.notice_period ?? "");
  const [city, setCity] = useState(p.current_location ?? "");
  const [relocation, setRelocation] = useState(p.open_to_relocation ?? "");
  const [workMode, setWorkMode] = useState(p.work_mode ?? "");
  const [comm, setComm] = useState("");
  const [openness, setOpenness] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ratio = Number(ctc) > 0 && Number(p.total_experience_years) >= 1 ? Number(ctc) / Number(p.total_experience_years) : null;
  // What still has to be asked on this call. Everything else is already on the profile.
  const toAsk = [
    !p.current_fixed_ctc && "current pay",
    !p.expected_fixed_ctc && "expected pay",
    !p.notice_period && "notice period",
    !p.current_location && "city",
    !p.open_to_relocation && "open to relocating",
    !p.open_fresh && "whether they are looking",
  ].filter(Boolean) as string[];

  async function log(outcome: string, extra: Record<string, unknown> = {}) {
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: p.id,
          outcome,
          fields: outcome === "reached" ? { current_fixed_ctc: ctc, expected_fixed_ctc: expected, notice_period: notice, current_location: city, open_to_relocation: relocation, work_mode: workMode } : {},
          communication: comm || null,
          openness: openness || null,
          note,
          ...extra,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) setError(d.error ?? "That didn't save. Try again.");
      else onDone(outcome);
    } catch {
      setError("The connection dropped. Check, then try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3.5">
      {toAsk.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <b>Ask:</b> {toAsk.join(", ")}. Also listen for how clearly they explain their work.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current fixed pay" missing={!p.current_fixed_ctc}>
          <select value={ctc} onChange={(e) => setCtc(e.target.value)} className={select}>
            <option value="">Select</option>
            {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Expected fixed pay" missing={!p.expected_fixed_ctc}>
          <select value={expected} onChange={(e) => setExpected(e.target.value)} className={select}>
            <option value="">Select</option>
            {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
      </div>
      {ratio !== null && (
        <p className={`text-[12px] ${ratio >= 1.5 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>
          Pay-to-experience ratio {ratio.toFixed(2)} {ratio >= 1.5 ? "(meets the top-tier bar of 1.5)" : "(below the top-tier bar of 1.5)"}
          {ratio > 6 ? ". Very high: double-check the number." : ""}
        </p>
      )}
      <Field label="Notice period" missing={!p.notice_period}>
        <Chips value={notice} options={asOpts(noticePeriodOptions)} onChange={setNotice} />
      </Field>
      <Field label="Current city" missing={!p.current_location}>
        <input list="calls-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Type or pick a city" className={select} />
        <datalist id="calls-city">{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Open to relocating?" missing={!p.open_to_relocation}>
        <Chips value={relocation} options={asOpts(relocationOptions)} onChange={setRelocation} />
      </Field>
      <Field label="Work mode">
        <Chips value={workMode} options={asOpts(workModeOptions)} onChange={setWorkMode} />
      </Field>
      <Field label="Communication on the call">
        <Chips
          value={comm}
          options={[{ v: "good", label: "Good" }, { v: "okay", label: "Okay" }, { v: "weak", label: "Weak" }]}
          onChange={setComm}
          tone={(v) => (v === "good" ? "border-emerald-600 bg-emerald-600 text-white" : v === "okay" ? "border-amber-500 bg-amber-500 text-white" : "border-rose-500 bg-rose-500 text-white")}
        />
        {p.comm && !comm && <p className="mt-1 text-[11.5px] text-slate-400">Last rated {p.comm}.</p>}
      </Field>
      <Field label="Looking for a new role?" missing={!p.open_fresh}>
        <Chips value={openness} options={[{ v: "Looking", label: "Yes, looking" }, { v: "Not now", label: "Not now" }]} onChange={setOpenness} />
      </Field>
      <Field label="Note (optional)">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Anything worth remembering" className={select} />
      </Field>

      {error && <p className="text-[12.5px] font-medium text-rose-600">{error}</p>}
      <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" disabled={!!busy} onClick={() => log("reached")} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          <Check className="h-4 w-4" /> {busy === "reached" ? "Saving…" : "Spoke to them: save and next"}
        </button>
        <div className="flex flex-wrap gap-1.5">
          {[
            { o: "no_answer", label: "No answer" },
            { o: "call_later", label: "Call back tomorrow", extra: { callBackAt: callBackAt(1) } },
            { o: "call_later", label: "In 3 days", extra: { callBackAt: callBackAt(3) }, key: "later3" },
            { o: "not_interested", label: "Not interested" },
            { o: "wrong_number", label: "Wrong number" },
          ].map((b) => (
            <button key={b.key ?? b.label} type="button" disabled={!!busy} onClick={() => log(b.o, b.extra)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {busy === b.o ? "Saving…" : b.label}
            </button>
          ))}
        </div>
        <p className="text-[11.5px] text-slate-400">No answer brings them back tomorrow (up to 3 tries). Not interested rests them for 90 days.</p>
      </div>
    </div>
  );
}

// Works the same on a phone: the list folds away behind a bar with Previous / Next, the CV opens on a tap, and the number
// dials straight from the phone. On a laptop the number can be copied to dial from any phone.
export default function CallsDesk({ people }: { people: CallPerson[] }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(people[0]?.id ?? null);
  const [showList, setShowList] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [copied, setCopied] = useState(false);
  const active = people.find((p) => p.id === selected) ?? null;
  const left = useMemo(() => people.filter((p) => !done[p.id]).length, [people, done]);
  const index = active ? people.findIndex((p) => p.id === active.id) : -1;
  const go = (step: number) => {
    if (index < 0) return;
    const next = people[(index + step + people.length) % people.length];
    setSelected(next.id);
    setShowCv(false);
  };

  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Nobody to call right now. Everyone worth calling has been reached, or is due later.
      </div>
    );
  }

  function finished(outcome: string) {
    if (!active) return;
    const next = { ...done, [active.id]: outcome };
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
                <span className={`mt-1 inline-block rounded px-1.5 py-px text-[11px] font-medium ${REASON[p.reason].cls}`}>
                  {REASON[p.reason].label}
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
                {active.resume_url && (
                  <button type="button" onClick={() => setShowCv((v) => !v)} className="rounded-full border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 xl:hidden dark:border-slate-600 dark:text-slate-200">
                    {showCv ? "Hide CV" : "View CV"}
                  </button>
                )}
              </div>
            </div>
            <CallForm key={active.id} p={active} onDone={finished} />
          </section>

          <section className={`${showCv ? "block" : "hidden"} h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:col-span-2 xl:col-span-1 xl:block xl:h-[78vh] dark:border-slate-700 dark:bg-slate-900`}>
            {active.resume_url && active.resume_file_url ? (
              <div className="h-full overflow-auto">
                <ResumeViewerInline key={active.id} signedUrl={active.resume_url} fileName={active.resume_file_url.replace(/^resumes\//, "")} />
              </div>
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
