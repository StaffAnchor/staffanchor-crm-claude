"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Counts = { calls: number; picked: number; not_interested: number; no_answer: number; gate: number; full: number };
type Day = Counts & { day: string; call_later: number; wrong_number: number };
type Person = Counts & { id: string | null; name: string };
type Activity = { from: string; to: string; days: Day[]; people: Person[] };

const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const PRESETS = [
  { key: "today", label: "Today", days: 1 },
  { key: "3", label: "Last 3 days", days: 3 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "15", label: "Last 15 days", days: 15 },
  { key: "30", label: "Last 30 days", days: 30 },
] as const;

// Today's date in India, as YYYY-MM-DD, so "today" means the recruiter's day.
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const pctOf = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

const sumOf = (rows: Counts[]): Counts => rows.reduce((a, r) => ({ calls: a.calls + r.calls, picked: a.picked + r.picked, not_interested: a.not_interested + r.not_interested, no_answer: a.no_answer + r.no_answer, gate: a.gate + r.gate, full: a.full + r.full }), { calls: 0, picked: 0, not_interested: 0, no_answer: 0, gate: 0, full: 0 });

// A day-by-day tracker of the calling and completion work, for any range: calls attempted, picked up, not interested,
// no answer and profiles completed, for everyone or one person. Numbers come from the call log and the completion events.
export default function ActivityTracker({ group, label }: { group: string | null; label: string }) {
  const [preset, setPreset] = useState<string>("7");
  const [from, setFrom] = useState(() => shift(istToday(), -6));
  const [to, setTo] = useState(istToday);
  const [caller, setCaller] = useState<string>("");
  const [data, setData] = useState<Activity | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: d, error } = await createClient().rpc("completion_activity", { p_from: from, p_to: to, p_group: group, p_caller: caller || null });
    if (error || !d) {
      setFailed(true);
    } else {
      setFailed(false);
      setData(d as Activity);
      // The person list always comes from the unfiltered view, so choosing one person does not empty the menu.
      if (!caller) setPeople((d as Activity).people.filter((p) => p.id));
    }
    setLoading(false);
  }, [from, to, group, caller]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  function pick(key: string, days: number) {
    const t = istToday();
    setPreset(key);
    setTo(t);
    setFrom(shift(t, -(days - 1)));
  }

  const days = useMemo(() => [...(data?.days ?? [])].reverse(), [data]);
  const total = useMemo(() => sumOf(data?.days ?? []), [data]);
  const extra = useMemo(() => (data?.days ?? []).reduce((a, d) => ({ later: a.later + d.call_later, wrong: a.wrong + d.wrong_number }), { later: 0, wrong: 0 }), [data]);
  const maxCalls = Math.max(1, ...days.map((d) => d.calls));
  const rangeNote = data && data.from !== from ? " (shown for the latest 92 days)" : "";

  const tile = (title: string, value: number, sub?: string, tone = "text-slate-900 dark:text-slate-100") => (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <p className={`mt-0.5 text-[24px] font-semibold leading-none tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-1 text-[11.5px] text-slate-500">{sub}</p>}
    </div>
  );
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12px] font-medium transition ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`;
  const th = "pb-1.5 text-right font-medium";

  return (
    <section className={`${card} mb-5 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Daily activity · {label}</h2>
        <p className="text-[11.5px] text-slate-400">From the call log and profile completions. Days are India days.{rangeNote}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => pick(p.key, p.days)} className={chip(preset === p.key)}>{p.label}</button>
        ))}
        <button type="button" onClick={() => setPreset("custom")} className={chip(preset === "custom")}>Custom dates</button>
        {preset === "custom" && (
          <span className="ml-1 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900" />
            to
            <input type="date" value={to} min={from} max={istToday()} onChange={(e) => e.target.value && setTo(e.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900" />
          </span>
        )}
        <select value={caller} onChange={(e) => setCaller(e.target.value)} className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id ?? ""}>{p.name}</option>
          ))}
        </select>
      </div>

      {failed ? (
        <p className="mt-4 text-[12.5px] text-rose-600">Could not load the activity. Refresh the page to try again.</p>
      ) : !data ? (
        <p className="mt-4 text-[12.5px] text-slate-400">Loading…</p>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {tile("Calls attempted", total.calls, extra.later + extra.wrong > 0 ? `${extra.later} call later · ${extra.wrong} wrong no.` : undefined)}
            {tile("Picked up", total.picked, `${pctOf(total.picked, total.calls)} of calls`, "text-emerald-700 dark:text-emerald-400")}
            {tile("Not interested", total.not_interested, `${pctOf(total.not_interested, total.picked)} of those who picked up`, "text-rose-700 dark:text-rose-400")}
            {tile("No answer", total.no_answer, `${pctOf(total.no_answer, total.calls)} of calls`, "text-amber-700 dark:text-amber-400")}
            {tile("Got pay + CV", total.gate, "profiles that crossed the line", "text-teal-700 dark:text-teal-400")}
            {tile("Fully complete", total.full, "every field filled")}
          </div>

          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="overflow-x-auto">
              <p className="mb-1 text-[11.5px] font-medium text-slate-500">Day by day</p>
              <table className="w-full min-w-[520px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="pb-1.5 text-left font-medium">Day</th>
                    <th className={th}>Calls</th>
                    <th className={th}>Picked up</th>
                    <th className={th}>Not interested</th>
                    <th className={th}>No answer</th>
                    <th className={th}>Pay + CV</th>
                    <th className={th}>Full</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className="border-b border-slate-50 dark:border-slate-800/60">
                      <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{dayLabel(d.day)}</td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:inline-block dark:bg-slate-800"><span className="block h-full rounded-full bg-slate-400" style={{ width: `${(d.calls / maxCalls) * 100}%` }} /></span>
                          <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">{d.calls}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{d.picked}<span className="ml-1 text-[11px] text-slate-400">{d.calls ? pctOf(d.picked, d.calls) : ""}</span></td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{d.not_interested}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{d.no_answer}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-teal-700 dark:text-teal-400">{d.gate}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{d.full}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-900 dark:text-slate-100">
                    <td className="pt-2">Total</td>
                    <td className="pt-2 text-right tabular-nums">{total.calls}</td>
                    <td className="pt-2 text-right tabular-nums">{total.picked}</td>
                    <td className="pt-2 text-right tabular-nums">{total.not_interested}</td>
                    <td className="pt-2 text-right tabular-nums">{total.no_answer}</td>
                    <td className="pt-2 text-right tabular-nums">{total.gate}</td>
                    <td className="pt-2 text-right tabular-nums">{total.full}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <p className="mb-1 text-[11.5px] font-medium text-slate-500">By person</p>
              {data.people.length === 0 ? (
                <p className="text-[12.5px] text-slate-400">No calls or completions in this range.</p>
              ) : (
                <table className="w-full min-w-[400px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="pb-1.5 text-left font-medium">Person</th>
                      <th className={th}>Calls</th>
                      <th className={th}>Picked up</th>
                      <th className={th}>Not int.</th>
                      <th className={th}>Pay + CV</th>
                      <th className={th}>Full</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((p) => (
                      <tr key={p.id ?? p.name} className="border-b border-slate-50 dark:border-slate-800/60">
                        <td className="max-w-[140px] truncate py-1.5 pr-2 text-slate-700 dark:text-slate-200">{p.name}</td>
                        <td className="py-1.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">{p.calls}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.picked}<span className="ml-1 text-[11px] text-slate-400">{p.calls ? pctOf(p.picked, p.calls) : ""}</span></td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.not_interested}</td>
                        <td className="py-1.5 text-right font-semibold tabular-nums text-teal-700 dark:text-teal-400">{p.gate}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.full}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-[11px] leading-snug text-slate-400">Picked up = reached, not interested or asked to call later. Profile completions are counted for whoever edited the profile, from 31 Oct 2026.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
