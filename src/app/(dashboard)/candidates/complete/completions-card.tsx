"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type Trend = { days: { day: string; gate: number; vitals: number; full: number }[]; mtd: { gate: number; vitals: number; full: number }; people: { name: string; gate: number; vitals: number; full: number }[] };
type Live = {
  people: { name: string; gate: number; vitals: number; full: number; calls: number; spoke: number; no_answer: number }[];
  feed: { at: string; kind: "gate" | "vitals" | "full"; candidate_id: string; candidate: string | null; by: string }[];
};

const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const REFRESH_MS = 15_000;
const KIND_TEXT: Record<string, string> = { gate: "now has current pay + CV", vitals: "now has all vitals", full: "is now fully complete" };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// Completions, kept current: the numbers, today's work by person (calls and completions) and a feed of who completed
// whom. It asks for fresh numbers every 15 seconds while the page is open, and straight away when you come back to the tab.
export default function CompletionsCard({ initial, group, label }: { initial: Trend; group: string | null; label: string }) {
  const [trend, setTrend] = useState<Trend>(initial);
  const [live, setLive] = useState<Live | null>(null);
  const [view, setView] = useState<"today" | "month">("today");
  const [updated, setUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [t, l] = await Promise.all([supabase.rpc("completion_trend", { p_group: group, p_days: 30 }), supabase.rpc("completion_live", { p_group: group })]);
    if (t.data) setTrend(t.data as Trend);
    if (l.data) setLive(l.data as Live);
    if (t.data || l.data) setUpdated(new Date());
  }, [group]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  const days = trend.days;
  const max = Math.max(1, ...days.map((d) => d.gate));
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const tile = (title: string, a: { gate: number; vitals: number; full: number } | undefined) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{a?.gate ?? 0}<span className="ml-1 text-[11.5px] font-normal text-slate-500">got pay + CV</span></p>
    </div>
  );

  return (
    <section className={`${card} mb-5 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Completions · {label}</h2>
        <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live{updated ? `, updated ${updated.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}` : ""}. Counted each time a profile crosses a line, whoever edits it. Edits made elsewhere before 31 Oct 2026 were not recorded.
        </p>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)_minmax(0,380px)]">
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {tile("Today", today)}
          {tile("Yesterday", yesterday)}
          {tile("Month to date", trend.mtd)}
        </div>
        <div>
          <p className="mb-1 text-[11.5px] text-slate-500">Profiles that got current pay and a CV, per day, last 30 days</p>
          <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Daily completions, last 30 days">
            {days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${shortDay(d.day)}: ${d.gate} got pay + CV`}>
                <div className={`w-full rounded-t ${d.gate > 0 ? "bg-teal-500" : "bg-slate-100 dark:bg-slate-800"}`} style={{ height: `${d.gate > 0 ? Math.max(6, (d.gate / max) * 100) : 4}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-slate-400"><span>{shortDay(days[0].day)}</span><span>{shortDay(days[days.length - 1].day)}</span></div>
          <p className="mb-1 mt-4 text-[11.5px] font-medium text-slate-500">Just now</p>
          {!live ? (
            <p className="text-[12.5px] text-slate-400">Loading…</p>
          ) : live.feed.filter((f) => f.kind === "gate").length === 0 ? (
            <p className="text-[12.5px] text-slate-400">No profile has got current pay and a CV yet today.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {live.feed.filter((f) => f.kind === "gate").map((f, i) => (
                <li key={`${f.at}-${i}`} className="text-[12.5px] text-slate-600 dark:text-slate-300">
                  <span className="tabular-nums text-slate-400">{timeOf(f.at)}</span> · <b className="font-medium text-slate-800 dark:text-slate-100">{f.by}</b>: <Link href={`/candidates/${f.candidate_id}`} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline dark:text-teal-300">{f.candidate ?? "A profile"}</Link> {KIND_TEXT[f.kind] ?? f.kind}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11.5px] text-slate-500">Who did what</p>
            <span className="flex gap-1 text-[11.5px]">
              {(["today", "month"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-2.5 py-0.5 font-medium ${view === v ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{v === "today" ? "Today" : "This month"}</button>
              ))}
            </span>
          </div>
          {view === "today" ? (
            !live ? (
              <p className="text-[12.5px] text-slate-400">Loading…</p>
            ) : live.people.length === 0 ? (
              <p className="text-[12.5px] text-slate-400">No calls or completions yet today.</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <th className="pb-1 font-medium">Person</th>
                    <th className="pb-1 text-right font-medium" title="Calls logged today">Calls</th>
                    <th className="pb-1 text-right font-medium" title="Share of calls where someone picked up">Picked up</th>
                    <th className="pb-1 text-right font-medium" title="Profiles that got current pay and a CV">Pay + CV</th>
                  </tr>
                </thead>
                <tbody>
                  {live.people.map((p) => (
                    <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="truncate py-1 pr-2 text-slate-700 dark:text-slate-200">{p.name}</td>
                      <td className="py-1 text-right tabular-nums text-slate-700 dark:text-slate-200">{p.calls}</td>
                      <td className="py-1 text-right tabular-nums text-slate-500">{p.calls > 0 ? `${Math.round((p.spoke / p.calls) * 100)}%` : "–"}</td>
                      <td className="py-1 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{p.gate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : trend.people.length === 0 ? (
            <p className="text-[12.5px] text-slate-400">Nobody has completed a profile yet this month.</p>
          ) : (
            <ul className="space-y-1.5">
              {trend.people.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-slate-700 dark:text-slate-200">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500"><b className="text-slate-900 dark:text-slate-100">{p.gate}</b> got pay + CV</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
