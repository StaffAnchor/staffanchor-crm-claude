"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Mic, Square } from "lucide-react";
import { recordingToWav } from "@/lib/voice-wav";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { cityOptions, fixedCtcOptions, noticePeriodOptions, relocationOptions } from "@/lib/candidate-options";
import { yourLevelOptions } from "@/lib/candidate-taxonomy";
import { POOL_TIERS, POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import { JUDGMENTS, TEAM_HANDLED, WORK_STYLES, type CallSegment, type JudgmentKey } from "@/lib/call-form-options";
import { profileKind } from "@/lib/profile-kind";

// The one call form, used on Calls today, on the candidate profile and in the role page's confirm-details window, so a
// call is recorded the same way everywhere. Everything typed here goes onto the profile; the after-the-call note is read
// by the system (fills blanks, ratings, verdict, client brief, matches); the result is logged in call_log.

export type CallResult = { outcome: string; callBackAt?: string | null; name: string; candidateId?: string; stillMissing?: string[]; summary: string | null; filled: string[]; tier: string | null; concerns: string[]; reading?: boolean };

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
  /** Present on the call desk: lets the form show whether a CV is on file. */
  resume_file_url?: string | null;
  phone?: string | null;
  /** b2b_sales, b2c_sales or non_sales; empty or "unclear" when not decided yet. */
  profile_group?: string | null;
  sub_domain?: string | null;
};

// N hours from now, as an ISO time.
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

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
          className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
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
      <p className={`mb-1 flex items-center gap-1.5 text-[13px] font-medium ${known ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}`}>
        {label}
        {missing && <span className="rounded bg-amber-100 px-1.5 text-[12px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">ask</span>}
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
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[12px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-slate-900 dark:text-slate-100">{title}</span>
          <span className="block text-[12px] text-slate-500">{hint}</span>
        </span>
        {total !== undefined && filled !== undefined && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium ${filled >= total ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{filled}/{total}</span>
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
          <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : value.length >= max ? value : [...value, o])} className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
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
const selectKnown = "w-full rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-[14px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400";
const selectMissing = "w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[14px] shadow-sm dark:border-amber-700 dark:bg-slate-900";
const select = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[14px] dark:border-slate-700 dark:bg-slate-900";
const num = (v: number | string | null | undefined) => (v !== null && v !== undefined && v !== "" && Number(v) > 0 ? String(Number(v)) : "");

export default function CallRecordForm({
  p,
  onDone,
  doubts = [],
  mode = "desk",
  roleCluster = null,
}: {
  p: CallFormPerson;
  onDone: (r: CallResult) => void;
  /** The role this call is for, when it is made from a role's pipeline: a service role asks service questions, whatever the person's profile says. */
  roleCluster?: string | null;
  /** Points worth testing, from the CV. */
  doubts?: string[];
  /** desk: Calls today, which moves to the next person; profile: stays on this person. */
  mode?: "desk" | "profile";
}) {
  const [tier, setTier] = useState<PoolTier | null>(null);
  const [customBack, setCustomBack] = useState("");
  const [backOpen, setBackOpen] = useState(false);
  const me = useMyFirstName();
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
  // What they sell: the product world the matching reads. Loaded once, pre-filled from what we already hold.
  const [sellsWorld, setSellsWorld] = useState("");
  const [worldKnown, setWorldKnown] = useState(false);
  const [worlds, setWorlds] = useState<{ slug: string; name: string; family: string }[]>([]);
  useEffect(() => {
    let off = false;
    const sb = createClient();
    void (async () => {
      const [{ data: w }, { data: sp }] = await Promise.all([sb.from("selling_worlds").select("slug, name, family").order("sort_order"), sb.from("candidate_selling_profiles").select("worlds").eq("candidate_id", p.id).maybeSingle()]);
      if (off) return;
      setWorlds((w ?? []) as { slug: string; name: string; family: string }[]);
      const first = ((sp?.worlds ?? []) as { slug: string }[])[0]?.slug;
      if (first) { setSellsWorld(first); setWorldKnown(true); }
    })();
    return () => { off = true; };
  }, [p.id]);
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
  // Service and other non-sales questions.
  const [teamHandled, setTeamHandled] = useState("");
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const [customerKind, setCustomerKind] = useState("");
  const [metricsOwned, setMetricsOwned] = useState<string[]>([]);
  const [shiftPattern, setShiftPattern] = useState("");
  const [revenueTarget, setRevenueTarget] = useState("");
  const [workStyle, setWorkStyle] = useState("");
  const [keyTools, setKeyTools] = useState("");
  const [certifications, setCertifications] = useState("");
  const [canMessage, setCanMessage] = useState("");
  const [openness, setOpenness] = useState("");
  const [note, setNote] = useState("");
  // The read-back: what the system will remember from the note, shown before the call is saved.
  type ReadBack = { summary: string; wants: string[]; dealbreakers: string[]; strengths: string[]; concerns: string[] };
  const [readBack, setReadBack] = useState<ReadBack | null>(null);
  const [reading, setReading] = useState(false);
  const MIN_NOTE = 30;
  // Voice note: speak the note instead of typing it; it is turned into text in the box, which you can still edit.
  const [voice, setVoice] = useState<"idle" | "recording" | "converting">("idle");
  const [voiceSecs, setVoiceSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_VOICE_SECS = 110;
  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );
  async function startVoice() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        setVoice("converting");
        try {
          const wav = await recordingToWav(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
          const fd = new FormData();
          fd.append("audio", wav, "note.wav");
          const res = await fetch("/api/calls/transcribe", { method: "POST", body: fd });
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.text) {
            setNote((n) => (n.trim() ? `${n.trim()}\n${d.text}` : d.text));
            setReadBack(null);
          } else setError(d.error ?? "Couldn't turn that voice note into text. Type it instead.");
        } catch {
          setError("Couldn't turn that voice note into text. Type it instead.");
        } finally {
          setVoice("idle");
        }
      };
      recRef.current = mr;
      mr.start();
      setVoiceSecs(0);
      setVoice("recording");
      timerRef.current = setInterval(() => {
        setVoiceSecs((s) => {
          if (s + 1 >= MAX_VOICE_SECS && recRef.current?.state === "recording") recRef.current.stop();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Allow the microphone in your browser to record a voice note.");
    }
  }
  function stopVoice() {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ratio = Number(ctc) > 0 && Number(p.total_experience_years) >= 1 ? Number(ctc) / Number(p.total_experience_years) : null;
  // What still has to be asked on this call. Everything else is already on the profile.
  const toAsk = [
    !num(p.expected_fixed_ctc) && "expected pay",
    !p.notice_period && "notice period",
    !p.current_location && "city",
    !p.open_to_relocation && "open to relocating",
    !p.open_fresh && "whether they are looking",
  ].filter(Boolean) as string[];
  const blank = (v: unknown) => v === null || v === "";
  const levelLead = yourLevelOptions.find((l) => l.value === level)?.lead;

  // On the call desk the two things that matter come first, in their own box; everything else is folded away below it.
  const desk = mode === "desk";
  const cvKnown = p.resume_file_url !== undefined;
  const needCv = cvKnown && !p.resume_file_url;
  const gateOpen = desk && (!num(p.current_fixed_ctc) || needCv);
  const waTemplates = candidateTemplates(p.full_name, { me, candidateId: p.id, missing: [!num(p.current_fixed_ctc) && "current_ctc", needCv && "cv"].filter(Boolean) as string[] }).filter((t) => t.key !== "intro");
  const waCv = waTemplates.filter((t) => ["tried", "cv", "details", "complete"].includes(t.key));

  // Which "about their work" questions to ask: the role's kind when called from a role, else the person's own profile type.
  const kind = profileKind(roleCluster, p.profile_group === undefined ? null : p.profile_group);
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
    if (kind !== "sales") {
      if (teamHandled) o.team_handled = teamHandled;
      if (workStyle) o.work_style = workStyle;
      if (keyTools.trim()) o.key_tools = keyTools.trim();
      if (certifications.trim()) o.certifications = certifications.trim();
    }
    if (kind === "service") {
      if (serviceTypes.length) o.service_type = serviceTypes;
      if (customerKind) o.customer_kind = customerKind;
      if (metricsOwned.length) o.metrics_owned = metricsOwned;
      if (shiftPattern) o.shift_pattern = shiftPattern;
      if (yn(revenueTarget) !== undefined) o.carries_revenue_target = yn(revenueTarget);
    }
    return o;
  };
  const rated = ["communication", "seriousness", "skill_match"].filter((x) => ratings[x as JudgmentKey]).length;

  // "Spoke to them": the note is required, and the person sees what will be remembered before the call is saved.
  async function saveSpoke() {
    if (note.trim().length < MIN_NOTE) {
      setError("Write a few words about what you discussed, rough is fine: what they want, what they will not accept, anything to remember.");
      return;
    }
    if (readBack) return log("reached", { readBack });
    setReading(true);
    setError(null);
    try {
      const res = await fetch("/api/calls/readback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: p.id, note }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.readBack) setReadBack(d.readBack as ReadBack);
      else await log("reached"); // the read-back is a courtesy: if it fails, the call still saves with the note as written
    } catch {
      await log("reached");
    } finally {
      setReading(false);
    }
  }

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
          sellsWorld: sellsWorld || null,
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
          callBackAt: typeof extra.callBackAt === "string" ? extra.callBackAt : null,
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
          setReadBack(null);
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
  const sellsShown = kind !== "other" && worlds.length > 0;
  const basicsKnown = [k.city, k.years, k.level, !sellsShown || worldKnown].every(Boolean);
  const basicsFilled = [city, years, level, sellsShown ? sellsWorld : "x"].filter(Boolean).length;
  const basicsTotal = sellsShown ? 4 : 3;
  const moveFilled = [openness, notice, relocation, offer].filter(Boolean).length;
  const payFilled = [ctc, expected, payFlex].filter(Boolean).length;
  const otherFilled = [workStyle, teamHandled].filter(Boolean).length;

  // Answers already on the profile fold away into one line; only what is missing stays open to fill.
  const split = (fs: { known: boolean; node: React.ReactNode }[], grid = false) => {
    const open = fs.filter((x) => !x.known);
    const done = fs.filter((x) => x.known);
    const wrap = (xs: typeof fs) => (grid ? <div className="grid grid-cols-2 gap-3">{xs.map((x) => x.node)}</div> : <div className="space-y-3.5">{xs.map((x) => x.node)}</div>);
    return (
      <>
        {open.length > 0 && wrap(open)}
        {done.length > 0 && (
          <details className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/40">
            <summary className="cursor-pointer text-[13px] text-slate-500">Already on the profile ({done.length}). Tap to correct</summary>
            <div className="mt-2">{wrap(done)}</div>
          </details>
        )}
      </>
    );
  };

  const stepWho = (n: number) => (
    <Step n={n} title="Confirm who they are" hint={basicsKnown ? "All on the profile. Open to correct anything" : "City, experience, level, what they sell"} filled={basicsFilled} total={basicsTotal} defaultOpen={!basicsKnown && !desk}>
      {split(
        [
          {
            known: k.city,
            node: (
              <Field key="city" label="Current city" missing={!k.city} known={k.city}>
                <input list={`calls-city-${p.id}`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Type or pick a city" className={sel(k.city)} />
                <datalist id={`calls-city-${p.id}`}>{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
            ),
          },
          {
            known: k.years,
            node: (
              <Field key="years" label="Total experience (years)" missing={p.total_experience_years !== undefined && !k.years} known={k.years}>
                <input type="number" inputMode="decimal" min="0" max="50" step="0.5" value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 6.5" className={sel(k.years)} />
              </Field>
            ),
          },
          {
            known: k.level,
            node: (
              <Field key="level" label="Role level" missing={!k.level} known={k.level}>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className={sel(k.level)}>
                  <option value="">Select</option>
                  {yourLevelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            ),
          },
          ...(sellsShown
            ? [
                {
                  known: worldKnown,
                  node: (
                    <Field key="sells" label="What do they sell?" missing={!worldKnown} known={worldKnown}>
                      <select value={sellsWorld} onChange={(e) => setSellsWorld(e.target.value)} className={sel(worldKnown)}>
                        <option value="">Select the closest</option>
                        {Array.from(new Set(worlds.map((w) => w.family))).map((fam) => (
                          <optgroup key={fam} label={fam}>{worlds.filter((w) => w.family === fam).map((w) => <option key={w.slug} value={w.slug}>{w.name}</option>)}</optgroup>
                        ))}
                      </select>
                    </Field>
                  ),
                },
              ]
            : []),
        ],
        true
      )}
    </Step>
  );
  const stepMove = (n: number) => (
    <Step n={n} title="Their move" hint="Looking, how soon, relocation, offer" filled={moveFilled} total={4} defaultOpen={!desk}>
      {split([
        {
          known: k.looking,
          node: (
            <Field key="looking" label="Looking for a new role?" missing={!k.looking} known={k.looking}>
              <Chips known={k.looking} value={openness} options={[{ v: "Looking", label: "Yes, looking" }, { v: "Not now", label: "Not now" }]} onChange={setOpenness} />
            </Field>
          ),
        },
        {
          known: k.notice,
          node: (
            <Field key="notice" label="Notice period" missing={!k.notice} known={k.notice}>
              <Chips known={k.notice} value={notice} options={asOpts(noticePeriodOptions)} onChange={setNotice} />
            </Field>
          ),
        },
        {
          known: k.relocation,
          node: (
            <Field key="reloc" label="Open to relocating?" missing={!k.relocation} known={k.relocation}>
              <Chips known={k.relocation} value={relocation} options={asOpts(relocationOptions)} onChange={setRelocation} />
            </Field>
          ),
        },
        {
          known: k.offer,
          node: (
            <Field key="offer" label="Offer in hand?" known={k.offer}>
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
          ),
        },
      ])}
    </Step>
  );
  const stepPay = (n: number) => (
    <Step n={n} title="Pay" hint="What they earn and what they want" filled={payFilled} total={3} defaultOpen={!desk}>
      {split(
        [
          ...(gateOpen ? [] : [{ known: k.ctc, node: <Field key="ctc" label="Current fixed pay" missing={!k.ctc} known={k.ctc}>{fixedPay(ctc, setCtc, k.ctc)}</Field> }]),
          { known: k.expected, node: <Field key="exp" label="Expected fixed pay" missing={!k.expected} known={k.expected}>{fixedPay(expected, setExpected, k.expected)}</Field> },
          {
            known: false,
            node: (
              <Field key="flex" label="Is the expectation flexible?">
                <Chips value={payFlex} options={asOpts(["Yes", "No"])} onChange={setPayFlex} />
              </Field>
            ),
          },
        ],
        true
      )}
      {ratio !== null && (
        <p className={`text-[13px] ${ratio >= 1.5 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>
          Pay-to-experience ratio {ratio.toFixed(2)} {ratio >= 1.5 ? "(meets the top-tier bar of 1.5)" : "(below the top-tier bar of 1.5)"}
          {ratio > 6 ? ". Very high: double-check the number." : ""}
        </p>
      )}
    </Step>
  );

  // Current pay is the first thing that must be on file, so when it is missing the Pay step comes first.
  const order = !k.ctc ? (["pay", "who", "move"] as const) : (["who", "move", "pay"] as const);
  return (
    <div className="space-y-3">
      {gateOpen && (
        <div className="rounded-xl border-2 border-teal-600/40 bg-teal-50 p-3 dark:border-teal-700 dark:bg-teal-950/30">
          <p className="text-[14px] font-semibold text-teal-900 dark:text-teal-100">Get these first</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">Current fixed pay</p>
              {k.ctc ? <p className="mt-1 flex items-center gap-1 text-[14px] font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /> On file: {p.current_fixed_ctc} LPA</p> : <div className="mt-1">{fixedPay(ctc, setCtc, false)}</div>}
            </div>
            <div>
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-200">CV</p>
              {!needCv ? (
                <p className="mt-1 flex items-center gap-1 text-[14px] font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /> On file</p>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[13px] text-rose-700 dark:text-rose-300">Missing: ask them to send it on WhatsApp</span>
                  <WhatsAppMenu phone={p.phone} templates={waCv} context={{ name: p.full_name }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[13px] font-semibold text-white hover:bg-emerald-700" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {(toAsk.length > 0 || doubts.length > 0) && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {toAsk.length > 0 && (
            <p>
              <b>{gateOpen ? "Then, if they have time, ask" : "Ask"}:</b> {toAsk.join(", ")}. Also listen for how clearly they explain their work.
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
      {desk && <p className="pt-1 text-[12px] font-medium uppercase tracking-wide text-slate-400">More details (optional)</p>}
      {order.map((key, i) => <span key={key} className="contents">{key === "who" ? stepWho(i + 1) : key === "move" ? stepMove(i + 1) : stepPay(i + 1)}</span>)}

      {kind === "other" && (
        <Step n={4} title="Their kind of work" hint="Hands-on or managing, and team size" filled={otherFilled} total={2} defaultOpen={!desk}>
          <Field label="Hands-on or managing people?">
            <Chips value={workStyle} options={asOpts([...WORK_STYLES])} onChange={setWorkStyle} />
          </Field>
          <Field label="How many people have they managed?">
            <Chips value={teamHandled} options={asOpts([...TEAM_HANDLED])} onChange={setTeamHandled} />
          </Field>
        </Step>
      )}

      <Step n={kind === "other" ? 5 : 4} title="Your read of them" hint="One tap each" filled={rated} total={3} defaultOpen={!desk}>
        <div className="space-y-2">
          {JUDGMENTS.filter((j) => ["communication", "seriousness", "skill_match"].includes(j.key)).map((j) => (
            <div key={j.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-[13px] font-medium text-slate-700 dark:text-slate-200">
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
        {p.comm && !ratings.communication && <p className="text-[12px] text-slate-400">Communication last rated {p.comm}.</p>}
      </Step>

      <Step n={kind === "other" ? 6 : 5} title="What you discussed (required)" hint="A few words, written like a text to a colleague" defaultOpen>
        <Field label="What did you discuss? Rough is fine: what they want, what they will not accept, anything to remember">
          <textarea
            value={note}
            onChange={(e) => { setNote(e.target.value); setReadBack(null); }}
            rows={4}
            placeholder="e.g. Sold ERP to mid-market, closes 25-30L deals, beat quota 3 years. Sharp, great communicator. Leads a team of 6. Worried he moved twice in 2 years."
            className={select}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {voice === "idle" && (
              <button type="button" onClick={() => void startVoice()} className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 px-2.5 py-1 text-[13px] font-semibold text-teal-700 hover:bg-teal-50">
                <Mic className="h-3.5 w-3.5" /> Speak your note
              </button>
            )}
            {voice === "recording" && (
              <button type="button" onClick={stopVoice} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400 bg-rose-50 px-2.5 py-1 text-[13px] font-semibold text-rose-700">
                <Square className="h-3.5 w-3.5 fill-current" /> Stop <span className="tabular-nums">{Math.floor(voiceSecs / 60)}:{String(voiceSecs % 60).padStart(2, "0")}</span>
                <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" aria-hidden />
              </button>
            )}
            {voice === "converting" && <span className="text-[13px] text-slate-500">Turning your voice into text…</span>}
            <span className="text-[12px] text-slate-400">Hindi, English or both. It goes into the box below and you can edit it. The recording is not kept.</span>
          </div>
          {readBack && (
            <div className="mt-2 space-y-1 rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-[13px] text-slate-700 dark:border-teal-900 dark:bg-teal-950/20 dark:text-slate-200">
              <p className="font-semibold text-teal-900 dark:text-teal-200">This is what I will remember:</p>
              {readBack.summary && <p>{readBack.summary}</p>}
              {readBack.wants.length > 0 && <p><b>Wants:</b> {readBack.wants.join("; ")}</p>}
              {readBack.dealbreakers.length > 0 && <p><b>Will not accept:</b> {readBack.dealbreakers.join("; ")}</p>}
              {readBack.strengths.length > 0 && <p><b>Strengths:</b> {readBack.strengths.join("; ")}</p>}
              {readBack.concerns.length > 0 && <p><b>Concerns:</b> {readBack.concerns.join("; ")}</p>}
              <p className="text-[12px] text-slate-500">Wrong? Change your note above and read it again.</p>
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-slate-500">Your verdict (optional):</span>
            {POOL_TIERS.map((t) => (
              <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(tier === t ? null : t)} className={`rounded-full border px-2.5 py-0.5 text-[13px] font-medium ${tier === t ? "border-amber-500 bg-amber-100 text-amber-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                {POOL_TIER_LABEL[t]}
              </button>
            ))}
          </div>
        </Field>

      </Step>

      {/* The result of the call: always on screen on the call desk, so "No answer" never needs a scroll. */}
      <div className={desk ? "sticky bottom-0 z-10 -mx-4 -mb-4 space-y-2 border-t border-slate-200 bg-white/95 px-4 pb-3 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" : "space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800"}>
        {error && <p className="text-[13px] font-medium text-rose-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={!!busy || reading} onClick={() => void saveSpoke()} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            <Check className="h-4 w-4" /> {busy === "reached" ? "Saving…" : reading ? "Reading your note…" : readBack ? (desk ? "Looks right: save and next" : "Looks right: save the call") : desk ? "Spoke: read my note" : "Spoke to them: read my note"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => log("no_answer")} className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[14px] font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {busy === "no_answer" ? "Saving…" : "No answer"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setBackOpen((v) => !v)} aria-expanded={backOpen} className={`rounded-lg border px-3 py-2 text-[14px] font-semibold disabled:opacity-50 ${backOpen ? "border-violet-500 bg-violet-100 text-violet-900" : "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100"}`}>
            Call back ▾
          </button>
          <button type="button" disabled={!!busy} onClick={() => log("not_interested")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            {busy === "not_interested" ? "Saving…" : "Not interested"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => log("wrong_number")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
            {busy === "wrong_number" ? "Saving…" : "Wrong number"}
          </button>
          {p.phone !== undefined && (
            <WhatsAppMenu phone={p.phone} templates={waTemplates} context={{ name: p.full_name }} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[14px] font-semibold text-emerald-800 hover:bg-emerald-100" />
          )}
        </div>
        {backOpen && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[13px] text-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
            <span className="font-medium">Call them back:</span>
            {[
              { label: "In 2 hours", extra: { callBackAt: inHours(2) } },
              { label: "Tomorrow 11 am", extra: { callBackAt: callBackAt(1) } },
              { label: "In 3 days", extra: { callBackAt: callBackAt(3) } },
            ].map((b) => (
              <button key={b.label} type="button" disabled={!!busy} onClick={() => log("call_later", b.extra)} className="rounded-full border border-violet-300 bg-white px-3 py-1 font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50 dark:bg-slate-900">{b.label}</button>
            ))}
            <span className="ml-1">or</span>
            <input type="datetime-local" value={customBack} onChange={(e) => setCustomBack(e.target.value)} className="rounded-md border border-violet-300 bg-white px-2 py-1 text-[13px] dark:bg-slate-900" />
            <button type="button" disabled={!!busy || !customBack} onClick={() => log("call_later", { callBackAt: new Date(customBack).toISOString() })} className="rounded-full bg-violet-600 px-3 py-1 font-semibold text-white hover:bg-violet-700 disabled:opacity-40">Set</button>
          </div>
        )}
        <p className="text-[12px] leading-snug text-slate-400">No answer: back on the list tomorrow, up to 3 tries. Call back: top of the list at the time you pick. Spoke but pay or CV still missing: back after 2 days. Not interested or wrong number: off the list.</p>
      </div>
    </div>
  );
}
