"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cityOptions, fixedCtcOptions, noticePeriodOptions, relocationOptions, workModeOptions } from "@/lib/candidate-options";
import { POOL_TIERS, POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";

// The one call form, used on Calls today, on the candidate profile and in the role page's confirm-details window, so a
// call is recorded the same way everywhere. Everything typed here goes onto the profile; the after-the-call note is read
// by the system (fills blanks, ratings, verdict, client brief, matches); the result is logged in call_log.

export type CallResult = { outcome: string; name: string; summary: string | null; filled: string[]; tier: string | null; concerns: string[] };

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
  const [offer, setOffer] = useState(p.offer_in_hand === true ? "Yes" : p.offer_in_hand === false ? "No" : "");
  const [offerCtc, setOfferCtc] = useState(p.offer_ctc ? String(p.offer_ctc) : "");
  const [comm, setComm] = useState("");
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
          fields: outcome === "reached" ? { current_fixed_ctc: ctc, expected_fixed_ctc: expected, notice_period: notice, current_location: city, open_to_relocation: relocation, work_mode: workMode } : {},
          offer: outcome === "reached" && offer ? { inHand: offer === "Yes", ctc: offer === "Yes" ? Number(offerCtc) : null } : null,
          communication: comm || null,
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
          summary: d.debrief?.summary ?? null,
          filled: [...((d.filled as string[] | undefined) ?? []).map((f) => f.replace(/_/g, " ")), ...((d.debrief?.filled as string[] | undefined) ?? [])],
          tier: d.debrief?.tier ?? null,
          concerns: (d.debrief?.concerns as string[] | undefined) ?? [],
        });
        if (mode === "profile") {
          setComm("");
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

  return (
    <div className="space-y-3.5">
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current fixed pay" missing={!num(p.current_fixed_ctc)}>
          <select value={ctc} onChange={(e) => setCtc(e.target.value)} className={select}>
            <option value="">Select</option>
            {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Expected fixed pay" missing={!num(p.expected_fixed_ctc)}>
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
        <input list={`calls-city-${p.id}`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Type or pick a city" className={select} />
        <datalist id={`calls-city-${p.id}`}>{cityOptions.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label="Open to relocating?" missing={!p.open_to_relocation}>
        <Chips value={relocation} options={asOpts(relocationOptions)} onChange={setRelocation} />
      </Field>
      <Field label="Work mode">
        <Chips value={workMode} options={asOpts(workModeOptions)} onChange={setWorkMode} />
      </Field>
      <Field label="Offer in hand?">
        <div className="flex flex-wrap items-center gap-2">
          <Chips value={offer} options={asOpts(["Yes", "No"])} onChange={setOffer} />
          {offer === "Yes" && (
            <select value={offerCtc} onChange={(e) => setOfferCtc(e.target.value)} className={`${select} w-40`}>
              <option value="">Offer CTC</option>
              {fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
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
          <Check className="h-4 w-4" /> {busy === "reached" ? (note.trim().length >= 8 ? "Saving and reading your note…" : "Saving…") : mode === "desk" ? "Spoke to them: save and next" : "Spoke to them: save the call"}
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
        <p className="text-[11.5px] text-slate-400">No answer brings them back in Calls today tomorrow (up to 3 tries). Not interested rests them for 90 days.</p>
      </div>
    </div>
  );
}
