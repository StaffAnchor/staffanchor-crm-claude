"use client";

import StillMissing from "@/components/still-missing";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import CallRecordForm, { type CallFormPerson, type CallResult } from "../call-record-form";
import { POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";
import { JUDGMENTS } from "@/lib/call-form-options";
import { fixedCtcOptions, noticePeriodOptions } from "@/lib/candidate-options";

export type LastCall = {
  at: string;
  by: string | null;
  ratings: Record<string, string | null> | null;
  segment: Record<string, unknown>;
  memory: string | null;
};

const FRESH_DAYS = 60;
const RATING_TONE: Record<string, string> = { good: "bg-emerald-50 text-emerald-700", okay: "bg-amber-50 text-amber-700", weak: "bg-rose-50 text-rose-700" };
const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : null);

// The facts a call recorded, as short readable lines.
function facts(p: CallFormPerson, seg: Record<string, unknown>): [string, string][] {
  const out: [string, string | null][] = [
    ["Current pay", p.current_fixed_ctc ? `₹${Number(p.current_fixed_ctc)}L` : null],
    ["Expected pay", p.expected_fixed_ctc ? `₹${Number(p.expected_fixed_ctc)}L` : null],
    ["Pay flexible", yn(seg.expected_ctc_negotiable)],
    ["Notice", p.notice_period ? `${p.notice_period}${typeof seg.notice_flex === "string" ? ` (${seg.notice_flex})` : ""}` : null],
    ["Relocation", p.open_to_relocation],
    ["Work mode", p.work_mode],
    ["Interviewing elsewhere", typeof seg.interviewing_elsewhere === "string" ? seg.interviewing_elsewhere : null],
    ["Why moving", Array.isArray(seg.reason_for_change) && seg.reason_for_change.length ? (seg.reason_for_change as string[]).join(", ") : null],
    ["Best time to call", typeof seg.best_time_to_call === "string" ? seg.best_time_to_call : null],
  ];
  return out.filter((r): r is [string, string] => !!r[1]);
}

export type PastDebrief = { id: string; created_at: string; author: string | null; raw_note: string; summary: string | null };

// The profile's call section: the same form as Calls today, so a call is recorded one way everywhere, with what the
// system did shown right after saving and the earlier calls underneath.
export default function ProfileCallSection({ person, doubts, history, roleCluster = null, lastCall = null }: { person: CallFormPerson; doubts: string[]; history: PastDebrief[]; roleCluster?: string | null; lastCall?: LastCall | null }) {
  const router = useRouter();
  const [last, setLast] = useState<CallResult | null>(null);
  const [round, setRound] = useState(0);
  // A person who has been called opens on the last call. The form opens only when a new call happened (or it was asked for).
  const [editing, setEditing] = useState(!lastCall);
  const [refresh, setRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState(person.notice_period ?? "");
  const [pay, setPay] = useState(person.expected_fixed_ctc ? String(Number(person.expected_fixed_ctc)) : "");
  const [openness, setOpenness] = useState("");
  const ageDays = lastCall ? Math.floor((Date.now() - new Date(lastCall.at).getTime()) / 86_400_000) : 0;
  const stale = ageDays > FRESH_DAYS;

  async function confirmStill() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/calls/reconfirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: person.id, ...(stale ? { notice_period: notice, expected_fixed_ctc: pay, openness } : {}) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) setErr(d.error ?? "That didn't save. Try again.");
      else {
        setOkMsg("Confirmed. The call counts as fresh for the next 60 days.");
        setRefresh(false);
        router.refresh();
      }
    } catch {
      setErr("The connection dropped. Check, then try again.");
    } finally {
      setBusy(false);
    }
  }

  const OUT: Record<string, string> = { reached: "Call saved", no_answer: "Logged: no answer", call_later: "Logged: call back", not_interested: "Logged: not interested", wrong_number: "Logged: wrong number" };

  return (
    <div>
      {last && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[13px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
          <p className="flex items-center gap-1.5 font-semibold">
            <Check className="h-4 w-4" /> {OUT[last.outcome] ?? "Saved"}.{last.tier ? ` Talent Pool: ${POOL_TIER_LABEL[last.tier as PoolTier] ?? last.tier}.` : ""}
          </p>
          {last.summary && <p className="mt-0.5">{last.summary}</p>}
          {last.filled.length > 0 && <p className="mt-0.5">Filled in: {last.filled.join(", ")}.</p>}
          {last.stillMissing && <StillMissing name={last.name} gaps={last.stillMissing} link={false} />}
          {last.concerns.length > 0 && <p className="mt-0.5 text-amber-800 dark:text-amber-300">Concerns noted: {last.concerns.join("; ")}.</p>}
          {(last.summary || last.reading) && <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-300/80">{last.reading ? "Your note is being read in the background. The details it fills, the client brief and the role matches update within a minute." : "The client brief and the role matches are being refreshed."}</p>}
        </div>
      )}
      {lastCall && !editing && (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Last call</p>
            <span className="text-[13px] text-slate-500">{dmy(lastCall.at)}{lastCall.by ? ` · ${lastCall.by}` : ""}</span>
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${stale ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{stale ? `${ageDays} days old, reconfirm` : ageDays === 0 ? "Today" : `${ageDays} day${ageDays === 1 ? "" : "s"} ago, still fresh`}</span>
          </div>
          {lastCall.ratings && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {JUDGMENTS.filter((j) => lastCall.ratings?.[j.key]).map((j) => (
                <span key={j.key} className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${RATING_TONE[lastCall.ratings![j.key] as string] ?? "bg-slate-100 text-slate-600"}`}>{j.label}: {lastCall.ratings![j.key]}</span>
              ))}
            </div>
          )}
          {facts(person, lastCall.segment).length > 0 && (
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
              {facts(person, lastCall.segment).map(([k, v]) => (
                <div key={k} className="flex gap-2"><dt className="shrink-0 text-slate-500">{k}</dt><dd className="min-w-0 font-medium text-slate-800 dark:text-slate-100">{v}</dd></div>
              ))}
            </dl>
          )}
          {(history[0]?.summary ?? history[0]?.raw_note ?? lastCall.memory) && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700 dark:bg-slate-800/50 dark:text-slate-200">{history[0]?.summary ?? history[0]?.raw_note ?? lastCall.memory}</p>
          )}
          {okMsg && <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700"><Check className="h-4 w-4" /> {okMsg}</p>}
          {err && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{err}</p>}
          {refresh && (
            <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-[13px]">
              <p className="font-medium text-amber-900">Three quick checks, since this call is over 60 days old.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-slate-600">Notice period</span>
                  <select value={notice} onChange={(e) => setNotice(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-slate-600 dark:bg-slate-900"><option value="">Select</option>{noticePeriodOptions.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-slate-600">Expected fixed pay</span>
                  <select value={pay} onChange={(e) => setPay(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[14px] dark:border-slate-600 dark:bg-slate-900"><option value="">Select</option>{fixedCtcOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-slate-600">Still looking?</span>
                {["Looking", "Not now"].map((o) => <button key={o} type="button" onClick={() => setOpenness(openness === o ? "" : o)} className={`rounded-full border px-3 py-1 font-medium ${openness === o ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{o}</button>)}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {stale && !refresh ? (
              <button onClick={() => { setRefresh(true); setOkMsg(null); }} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-[14px] font-medium text-white hover:bg-teal-800"><Check className="h-4 w-4" /> Reconfirm: still accurate</button>
            ) : (
              <button onClick={confirmStill} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-[14px] font-medium text-white hover:bg-teal-800 disabled:opacity-50"><Check className="h-4 w-4" /> {busy ? "Saving…" : stale ? "Confirm" : "Still accurate"}</button>
            )}
            <button onClick={() => { setEditing(true); setOkMsg(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-[14px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">Update after a new call</button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Confirming covers the person only. Each role still has its own check (interested, and each must-have) when you add them to it.</p>
        </div>
      )}
      {(!lastCall || editing) && (
      <>
      {lastCall && <button onClick={() => setEditing(false)} className="mb-2 text-[13px] text-slate-500 underline">← Back to the last call</button>}
      <CallRecordForm
        key={round}
        initial={lastCall ? { ratings: (lastCall.ratings ?? undefined) as never, segment: lastCall.segment } : null}
        p={person}
        doubts={doubts}
        mode="profile"
        roleCluster={roleCluster}
        onDone={(r) => {
          setLast(r);
          setRound((n) => n + 1);
          setEditing(false);
          setOkMsg(null);
          router.refresh();
        }}
      />
      </>
      )}
      {history.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300">Earlier calls</p>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-ros-md bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/50">
                <p className="text-xs text-slate-400">
                  {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {h.author ? ` · ${h.author}` : ""}
                </p>
                <p className="text-slate-700 dark:text-slate-200">{h.summary ?? h.raw_note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
