"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cityOptions, employmentStatusOptions, fixedCtcOptions, highestQualificationOptions, level1OptionsForProfileType, noticePeriodOptions, relocationOptions, workModeOptions } from "@/lib/candidate-options";
import { yourLevelOptions } from "@/lib/candidate-taxonomy";
import { POOL_TIERS, POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import { BEST_TIMES, CYCLES, INTERVIEWING, JUDGMENTS, NOTICE_FLEX, QUOTA_BANDS, REASONS, STYLES, type CallSegment, type JudgmentKey } from "@/lib/call-form-options";

// The one call form, used on Calls today, on the candidate profile and in the role page's confirm-details window, so a
// call is recorded the same way everywhere. Everything typed here goes onto the profile; the after-the-call note is read
// by the system (fills blanks, ratings, verdict, client brief, matches); the result is logged in call_log.

export type CallResult = { outcome: string; name: string; candidateId?: string; stillMissing?: string[]; summary: string | null; filled: string[]; tier: string | null; concerns: string[]; reading?: boolean };

export type CallFormPerson = {
  id: string;
  full_name: string | null;
  total_experience_years: number | string | null;
  current_fixed_ctc: number | string | null;
  expected_fixed_ctc: number | string | null;
  notice_period: string | null;
  current_location: string | null;
  open_to_relocation: string | null;
  work_mode: string | null;
  comm?: string | null;
  open_fresh?: boolean;
  offer_in_hand?: boolean | null;
  offer_ctc?: number | null;
  // What the registration form records, so a call can complete it. All optional: a surface that does not have them
  // simply shows them blank.
  current_employer?: string | null;
  current_job_title?: string | null;
  current_employment_status?: string | null;
  highest_qualification?: string | null;
  role_level?: string | null;
  role_type?: string | null;
  email?: string | null;
  current_variable_ctc?: number | string | null;
  /** b2b_sales, b2c_sales or non_sales; empty or "unclear" when not decided yet. */
  profile_group?: string | null;
  sub_domain?: string | null;
};

// IST 11:00 on a day N days from now, as an ISO time.
function callBackAt(days: number): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 11, 0) - 5.5 * 3_600_000).toISOString();
}

function Chips({ value, options, onChange, tone, known }: { value: string; options: { v: string; label: string }[]; onChange: (v: string) => void; tone?: (v: string) => string; known?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(value === o.v ? "" : o.v)}
          className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
            value === o.v ? (known ? "border-slate-300 bg-slate-200 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300" : tone?.(o.v) ?? "border-teal-600 bg-teal-600 text-white") : known ? "border-slate-100 text-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-500" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, missing, known, children }: { label: string; missing?: boolean; known?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className={`mb-1 flex items-center gap-1.5 text-[12px] font-medium ${known ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
        {label}
        {missing && <span className="rounded bg-amber-100 px-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">ask</span>}
      </p>
      {children}
    </div>
  );
}

// One stage of the call, in the order the conversation usually goes. The header shows how many of its answers are filled.
function Step({ n, title, hint, filled, total, children, defaultOpen = true }: { n: number; title: string; hint: string; filled?: number; total?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 dark:border-slate-700">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="block text-[11.5px] text-slate-500">{hint}</span>
        </span>
        {total !== undefined && filled !== undefined && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${filled >= total ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{filled}/{total}</span>
        )}
        <span className="text-slate-400 transition-transform group-open:rotate-180" aria-hidden>▾</span>
      </summary>
      <div className="space-y-3.5 border-t border-slate-100 px-3 pb-3 pt-3 dark:border-slate-800">{children}</div>
    </details>
  );
}

// Pick up to `max` answers.
function MultiChips({ value, options, onChange, max }: { value: string[]; options: readonly string[]; onChange: (v: string[]) => void; max: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : value.length >= max ? value : [...value, o])} className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

const length3 = (v: string | null | undefined) => (v ?? "").trim().length > 2;
const asOpts = (xs: string[]) => xs.map((x) => ({ v: x, label: x }));
// What is already on the profile is shown grey and quiet; what is missing stays white with an amber edge, so the eye goes there.
const selectKnown = "w-full rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400";
const selectMissing = "w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[13px] shadow-sm dark:border-amber-700 dark:bg-slate-900";
const select = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900";
const num = (v: number | string | null | undefined) => (v !== null && v !== undefined && v !== "" && Number(v) > 0 ? String(Number(v)) : "");

export default function CallRecordForm({
  p,
  onDone,
  doubts = [],
  mode = "desk",
}: {
  p: CallFormPerson;
  onDone: (r: CallResult) => void;
  /** Points worth testing, from the CV. */
  doubts?: string[];
  /** desk: Calls today, which moves to the next person; profile: stays on this person. */
  mode?: "desk" | "profile";
}) {
  const [tier, setTier] = useState<PoolTier | null>(null);
  const [ctc, setCtc] = useState(num(p.current_fixed_ctc));
  const [expected, setExpected] = useState(num(p.expected_fixed_ctc));
  const [notice, setNotice] = useState(p.notice_period ?? "");
  const [city, setCity] = useState(p.current_location ?? "");
  const [relocation, setRelocation] = useState(p.open_to_relocation ?? "");
  const [workMode, setWorkMode] = useState(p.work_mode ?? "");
  const [employer, setEmployer] = useState(p.current_employer ?? "");
  const [title, setTitle] = useState(p.current_job_title ?? "");
  const [years, setYears] = useState(num(p.total_experience_years));
  const [status, setStatus] = useState(p.current_employment_status ?? "");
  const [qualification, setQualification] = useState(p.highest_qualification ?? "");
  const [level, setLevel] = useState(p.role_level ?? "");
  const [name, setName] = useState(p.full_name ?? "");
  const [email, setEmail] = useState(p.email ?? "");
  const [group, setGroup] = useState(["b2b_sales", "b2c_sales", "non_sales"].includes(p.profile_group ?? "") ? (p.profile_group as string) : "");
  const [subDomain, setSubDomain] = useState(p.sub_domain ?? "");
  const [offer, setOffer] = useState(p.offer_in_hand === true ? "Yes" : p.offer_in_hand === false ? "No" : "");
  const [offerCtc, setOfferCtc] = useState(p.offer_ctc ? String(p.offer_ctc) : "");
  const [ratings, setRatings] = useState<Record<JudgmentKey, string>>({ communication: "", seriousness: "", stability: "", salary_realism: "", skill_match: "" });
  const [currentVar, setCurrentVar] = useState(num(p.current_variable_ctc));
  const [reasons, setReasons] = useState<string[]>([]);
  const [interviewing, setInterviewing] = useState("");
  const [noticeFlex, setNoticeFlex] = useState("");
  const [payFlex, setPayFlex] = useState("");
  const [carriesQuota, setCarriesQuota] = useState("");
  const [quotaBand, setQuotaBand] = useState("");
  const [style, setStyle] = useState("");
  const [cycle, setCycle] = useState("");
  const [bestTime, setBestTime] = useState("");
  const [canRefer, setCanRefer] = useState("");
  const [canMessage, setCanMessage] = useState("");
  const [openness, setOpenness] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ratio = Number(ctc) > 0 && Number(p.total_experience_years) >= 1 ? Number(ctc) / Number(p.total_experience_years) : null;
  // What still has to be asked on this call. Everything else is already on the profile.
  const toAsk = [
    !num(p.current_fixed_ctc) && "current pay",
    !num(p.expected_fixed_ctc) && "expected pay",
    !p.notice_period && "notice period",
    !p.current_location && "city",
    !p.open_to_relocation && "open to relocating",
    !p.open_fresh && "whether they are looking",
  ].filter(Boolean) as string[];
  const blank = (v: unknown) => v === null || v === "";
  const levelLead = yourLevelOptions.find((l) => l.value === level)?.lead;

  const isSales = p.profile_group === undefined || p.profile_group === "b2b_sales" || p.profile_group === "b2c_sales";
  const yn = (v: string) => (v === "Yes" ? true : v === "No" ? false : undefined);
  // Everything beyond the vitals that was tapped on this call; blanks are never sent, so nothing already known is overwritten.
  const segment = (): CallSegment => {
    const o: CallSegment = {};
    if (reasons.length) o.reason_for_change = reasons;
    if (interviewing) o.interviewing_elsewhere = interviewing;
    if (noticeFlex) o.notice_flex = noticeFlex;
    if (yn(payFlex) !== undefined) o.expected_ctc_negotiable = yn(payFlex);
    if (yn(carriesQuota) !== undefined) o.carries_quota = yn(carriesQuota);
    if (quotaBand) o.quota_last_year = quotaBand;
    if (style) o.style = style;
    if (cycle) o.cycle = cycle;
    if (bestTime) o.best_time_to_call = bestTime;
    if (yn(canRefer) !== undefined) o.can_refer = yn(canRefer);
    return o;
  };
  const rated = Object.values(ratings).filter(Boolean).length;

  async function log(outcome: string, extra: Record<string, unknown> = {}) {
    if (outcome === "reached" && offer === "Yes" && !offerCtc) {
      setError("Pick the offer CTC, or set offer in hand to No.");
      return;
    }
    setBusy(outcome);
    setError(null);
    try {
      const res = await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: p.id,
          outcome,
          fields: outcome === "reached" ? { current_fixed_ctc: ctc, expected_fixed_ctc: expected, notice_period: notice, current_location: city, open_to_relocation: relocation, work_mode: workMode, current_employer: employer, current_job_title: title, total_experience_years: years, current_employment_status: status, highest_qualification: qualification, role_level: level, full_name: name, email, profile_group: group, sub_domain: subDomain, current_variable_ctc: currentVar } : {},
          offer: outcome === "reached" && offer ? { inHand: offer === "Yes", ctc: offer === "Yes" ? Number(offerCtc) : null } : null,
          communication: ratings.communication || null,
          ratings: Object.fromEntries(Object.entries(ratings).filter(([, v]) => v)),
          segment: segment(),
          messageOk: canMessage === "Yes" ? true : canMessage === "No" ? false : null,
          openness: openness || null,
          note,
          tier,
          ...extra,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) setError(d.error ?? "That didn't save. Try again.");
      else {
        onDone({
          outcome,
          name: p.full_name ?? "Candidate",
          candidateId: p.id,
          stillMissing: (d.stillMissing as string[] | undefined) ?? undefined,
          summary: d.debrief?.summary ?? null,
          filled: [...((d.filled as string[] | undefined) ?? []).map((f) => f.replace(/_/g, " ")), ...((d.debrief?.filled as string[] | undefined) ?? [])],
          tier: d.debrief?.tier ?? null,
          concerns: (d.debrief?.concerns as string[] | undefined) ?? [],
          reading: d.reading === true,
        });
        if (mode === "profile") {
          setRatings({ communication: "", seriousness: "", stability: "", salary_realism: "", skill_match: "" });
          setOpenness("");
          setNote("");
          setTier(null);
        }
      }
    } catch {
      setError("The connection dropped. Check, then try again.");
    } finally {
      setBusy(null);
    }
  }

  // Known = already on the profile when the call opened. Known answers are grey; missing ones are white with an amber edge.
  const k = {
    city: !blank(p.current_location),
    years: !!num(p.total_experience_years),
    group: ["b2b_sales", "b2c_sales", "non_sales"].includes(p.profile_group ?? ""),
    sub: !blank(p.sub_domain),
    level: !blank(p.role_level),
    employer: !blank(p.current_employer),
    title: !blank(p.current_job_title),
    status: !blank(p.current_employment_status),
    qualification: !blank(p.highest_qualification),
    name: length3(p.full_name),
    email: /@/.test(p.email ?? ""),
    ctc: !!num(p.current_fixed_ctc),
    currentVar: !!num(p.current_variable_ctc),
    expected: !!num(p.expected_fixed_ctc),
    notice: !blank(p.notice_period),
    relocation: !blank(p.open_to_relocation),
    workMode: !blank(p.work_mode),
    offer: p.offer_in_hand !== undefined && p.offer_in_hand !== null,
    looking: !!p.open_fresh,
  };
  const sel = (known: boolean) => (known ? selectKnown : selectMissing);
  const fixedPay = (value: string, set: (v: string) => void, known: boolean) => (
    <select value={value} onChange={(e) => set(e.target.value)} className={sel(known)}>
      <option value="">Select</option>
      {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  const basicsKnown = [k.city, k.years, k.group, k.sub, k.level, k.employer, k.title, k.status, k.qualification, k.name].every(Boolean);
  const basicsFilled = [ctc, city, relocation, years, level, group, subDomain, name].filter(Boolean).length;
  const moveFilled = [openness, reasons.length ? "x" : "", notice, noticeFlex, interviewing, offer].filter(Boolean).length;
  const payFilled = [ctc, currentVar, expected, payFlex].filter(Boolean).length;
  const salesFilled = [carriesQuota, quotaBand, style, cycle].filter(Boolean).length;
  const stayFilled = [canMessage, bestTime, canRefer].filter(Boolean).length;

  const stepWho = (n: number) => (
    <>
      <Step n={n} title="Confirm who they are" hint={basicsKnown ? "All on the profile. Open to correct anything" : "Role, level, city, experience, domain"} filled={basicsFilled} total={8} defaultOpen={!basicsKnown}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current city" missing={!k.city} known={k.city}>
            <input list={`calls-city-${p.id}`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Type or pick a city" className={sel(k.city)} />
            <datalist id={`calls-city-${p.id}`}>{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Total experience (years)" missing={p.total_experience_years !== undefined && !k.years} known={k.years}>
            <input type="number" inputMode="decimal" min="0" max="50" step="0.5" value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 6.5" className={sel(k.years)} />
          </Field>
          {p.profile_group !== undefined && (
            <Field label="Domain" missing={!k.group} known={k.group}>
              <select value={group} onChange={(e) => { setGroup(e.target.value); setSubDomain(""); }} className={sel(k.group)}>
                <option value="">Select</option>
                <option value="b2b_sales">B2B Sales</option>
                <option value="b2c_sales">B2C Sales</option>
                <option value="non_sales">Non-Sales</option>
              </select>
            </Field>
          )}
          {p.sub_domain !== undefined && (
            <Field label="Sub-domain" missing={!k.sub} known={k.sub}>
              <select value={subDomain} onChange={(e) => setSubDomain(e.target.value)} className={sel(k.sub)} disabled={!group}>
                <option value="">{group ? "Select" : "Pick the domain first"}</option>
                {subDomain && !level1OptionsForProfileType(group).includes(subDomain) && <option value={subDomain}>{subDomain}</option>}
                {level1OptionsForProfileType(group).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          )}
          <Field label="Role level" missing={!k.level} known={k.level}>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={sel(k.level)}>
              <option value="">Select</option>
              {yourLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Current company" missing={!k.employer} known={k.employer}>
            <input value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Company" className={sel(k.employer)} />
          </Field>
          <Field label="Current job title" missing={!k.title} known={k.title}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={sel(k.title)} />
          </Field>
          <Field label="Employment status" missing={!k.status} known={k.status}>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel(k.status)}>
              <option value="">Select</option>
              {employmentStatusOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Highest qualification" missing={!k.qualification} known={k.qualification}>
            <select value={qualification} onChange={(e) => setQualification(e.target.value)} className={sel(k.qualification)}>
              <option value="">Select</option>
              {highestQualificationOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Full name" known={k.name} missing={!k.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={sel(k.name)} />
          </Field>
          {p.email !== undefined && (
            <Field label="Email" missing={!k.email} known={k.email}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" className={sel(k.email)} />
            </Field>
          )}
        </div>
        <p className="text-[11.5px] text-slate-400">
          Role type: {level ? (levelLead ? "Leads a team" : "Individual contributor") : p.role_type ?? "set by the level"}. Only changes are saved.
        </p>
      </Step>
    </>
  );
  const stepMove = (n: number) => (
    <>
      <Step n={n} title="Their move" hint="Are they looking, why, how soon, what else is on" filled={moveFilled} total={6}>
        <Field label="Looking for a new role?" missing={!k.looking} known={k.looking}>
          <Chips known={k.looking} value={openness} options={[{ v: "Looking", label: "Yes, looking" }, { v: "Not now", label: "Not now" }]} onChange={setOpenness} />
        </Field>
        <Field label="Why are they looking? (up to 3)">
          <MultiChips value={reasons} options={REASONS} onChange={setReasons} max={3} />
        </Field>
        <Field label="Notice period" missing={!k.notice} known={k.notice}>
          <Chips known={k.notice} value={notice} options={asOpts(noticePeriodOptions)} onChange={setNotice} />
        </Field>
        <Field label="Can they join earlier?">
          <Chips value={noticeFlex} options={NOTICE_FLEX.map((o) => ({ v: o.v, label: o.label }))} onChange={setNoticeFlex} />
        </Field>
        <Field label="Interviewing elsewhere?">
          <Chips value={interviewing} options={INTERVIEWING.map((o) => ({ v: o.v, label: o.label }))} onChange={setInterviewing} />
        </Field>
        <Field label="Offer in hand?" known={k.offer}>
          <div className="flex flex-wrap items-center gap-2">
            <Chips known={k.offer} value={offer} options={asOpts(["Yes", "No"])} onChange={setOffer} />
            {offer === "Yes" && (
              <select value={offerCtc} onChange={(e) => setOfferCtc(e.target.value)} className={`${select} w-40`}>
                <option value="">Offer CTC</option>
                {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
        </Field>
        <Field label="Open to relocating?" missing={!k.relocation} known={k.relocation}>
          <Chips known={k.relocation} value={relocation} options={asOpts(relocationOptions)} onChange={setRelocation} />
        </Field>
        <Field label="Work mode" known={k.workMode}>
          <Chips known={k.workMode} value={workMode} options={asOpts(workModeOptions)} onChange={setWorkMode} />
        </Field>
      </Step>
    </>
  );
  const stepPay = (n: number) => (
    <>
      <Step n={n} title="Pay" hint="What they earn and what they want" filled={payFilled} total={4}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current fixed pay" missing={!k.ctc} known={k.ctc}>{fixedPay(ctc, setCtc, k.ctc)}</Field>
          <Field label="Current variable pay" known={k.currentVar}>{fixedPay(currentVar, setCurrentVar, k.currentVar)}</Field>
          <Field label="Expected fixed pay" missing={!k.expected} known={k.expected}>{fixedPay(expected, setExpected, k.expected)}</Field>
          <Field label="Is the expectation flexible?">
            <Chips value={payFlex} options={asOpts(["Yes", "No"])} onChange={setPayFlex} />
          </Field>
        </div>
        {ratio !== null && (
          <p className={`text-[12px] ${ratio >= 1.5 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>
            Pay-to-experience ratio {ratio.toFixed(2)} {ratio >= 1.5 ? "(meets the top-tier bar of 1.5)" : "(below the top-tier bar of 1.5)"}
            {ratio > 6 ? ". Very high: double-check the number." : ""}
          </p>
        )}
      </Step>
    </>
  );

  // Current pay is the first thing that must be on file, so when it is missing the Pay step comes first.
  const order = !k.ctc ? (["pay", "who", "move"] as const) : (["who", "move", "pay"] as const);
  return (
    <div className="space-y-3">
      {(toAsk.length > 0 || doubts.length > 0) && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {toAsk.length > 0 && (
            <p>
              <b>Ask:</b> {toAsk.join(", ")}. Also listen for how clearly they explain their work.
            </p>
          )}
          {doubts.length > 0 && (
            <>
              <p className="mt-1 font-semibold">From the CV, worth checking:</p>
              <ul className="ml-4 list-disc">
                {doubts.slice(0, 5).map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <p className="text-[11.5px] text-slate-400">
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-slate-200 bg-slate-100 align-middle" /> Grey is already on the profile. <span className="mx-1 inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-white align-middle" /> White with an amber edge is missing: ask these.
      </p>

      {order.map((key, i) => <span key={key} className="contents">{key === "who" ? stepWho(i + 1) : key === "move" ? stepMove(i + 1) : stepPay(i + 1)}</span>)}

      {isSales && (
        <Step n={4} title="Sales depth" hint="Quota, style and cycle: the strongest fit signals for sales roles" filled={salesFilled} total={4} defaultOpen={p.profile_group !== undefined}>
          <Field label="Do they carry a quota?">
            <Chips value={carriesQuota} options={asOpts(["Yes", "No"])} onChange={setCarriesQuota} />
          </Field>
          {carriesQuota !== "No" && (
            <Field label="How much did they achieve last year?">
              <Chips value={quotaBand} options={asOpts([...QUOTA_BANDS])} onChange={setQuotaBand} />
            </Field>
          )}
          <Field label="Hunter or farmer?">
            <Chips value={style} options={asOpts([...STYLES])} onChange={setStyle} />
          </Field>
          <Field label="Typical sales cycle">
            <Chips value={cycle} options={asOpts([...CYCLES])} onChange={setCycle} />
          </Field>
        </Step>
      )}

      <Step n={isSales ? 5 : 4} title="Your read of them" hint="Two taps each. This sets their profile strength" filled={rated} total={5}>
        <div className="space-y-2">
          {JUDGMENTS.map((j) => (
            <div key={j.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-[12.5px] font-medium text-slate-700 dark:text-slate-200">
                {j.label} <span className="font-normal text-slate-400">· {j.hint}</span>
              </p>
              <Chips
                value={ratings[j.key]}
                options={[{ v: "good", label: "Good" }, { v: "okay", label: "Okay" }, { v: "weak", label: "Weak" }]}
                onChange={(v) => setRatings((r) => ({ ...r, [j.key]: v }))}
                tone={(v) => (v === "good" ? "border-emerald-600 bg-emerald-600 text-white" : v === "okay" ? "border-amber-500 bg-amber-500 text-white" : "border-rose-500 bg-rose-500 text-white")}
              />
            </div>
          ))}
        </div>
        {p.comm && !ratings.communication && <p className="text-[11.5px] text-slate-400">Communication last rated {p.comm}.</p>}
      </Step>

      <Step n={isSales ? 6 : 5} title="Stay in touch" hint="Consent, best time, referrals" filled={stayFilled} total={3} defaultOpen={false}>
        <Field label="OK to message them on WhatsApp and email about roles?">
          <Chips value={canMessage} options={asOpts(["Yes", "No"])} onChange={setCanMessage} />
        </Field>
        <Field label="Best time to call">
          <Chips value={bestTime} options={asOpts([...BEST_TIMES])} onChange={setBestTime} />
        </Field>
        <Field label="Can they refer a colleague?">
          <Chips value={canRefer} options={asOpts(["Yes", "No"])} onChange={setCanRefer} />
        </Field>
      </Step>

      <Step n={isSales ? 7 : 6} title="Wrap up" hint="Anything else, your verdict, then the result">
        <Field label="After the call (optional): write it like a text to a colleague">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="e.g. Sold ERP to mid-market, closes 25-30L deals, beat quota 3 years. Sharp, great communicator. Leads a team of 6. Worried he moved twice in 2 years."
            className={select}
          />
          <p className="mt-1 text-[11.5px] text-slate-400">The system reads it, fills any detail still blank, notes strengths and concerns for the client brief, and matches strong people to open roles.</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-slate-500">Your verdict (optional):</span>
            {POOL_TIERS.map((t) => (
              <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(tier === t ? null : t)} className={`rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${tier === t ? "border-amber-500 bg-amber-100 text-amber-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                {POOL_TIER_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-[12.5px] font-medium text-rose-600">{error}</p>}
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" disabled={!!busy} onClick={() => log("reached")} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy === "reached" ? "Saving…" : mode === "desk" ? "Spoke to them: save and next" : "Spoke to them: save the call"}
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
          <p className="text-[11.5px] text-slate-400">No answer brings them back in the call list tomorrow (up to 3 tries). Not interested rests them for 90 days.</p>
        </div>
      </Step>
    </div>
  );
}
