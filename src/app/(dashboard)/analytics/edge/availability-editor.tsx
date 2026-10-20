"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type W = { weekday: number; start: string; end: string };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const input = "rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-[13px]";

export default function AvailabilityEditor({ initial, minNoticeHours, horizonDays }: { initial: W[]; minNoticeHours: number; horizonDays: number }) {
  const router = useRouter();
  const byDay = (d: number) => initial.find((w) => w.weekday === d);
  const [rows, setRows] = useState(DAYS.map((_, i) => ({ on: !!byDay(i + 1), start: byDay(i + 1)?.start ?? "18:30", end: byDay(i + 1)?.end ?? "21:30" })));
  const [notice, setNotice] = useState(minNoticeHours);
  const [horizon, setHorizon] = useState(horizonDays);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/pro/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        windows: rows.map((r, i) => ({ weekday: i + 1, start: r.start, end: r.end, on: r.on })).filter((r) => r.on).map(({ weekday, start, end }) => ({ weekday, start, end })),
        minNoticeHours: notice,
        horizonDays: horizon,
      }),
    });
    setSaving(false);
    setMsg(res.ok ? "Saved." : "Couldn't save.");
    router.refresh();
  }

  return (
    <div className="space-y-3 text-[13px]">
      {rows.map((r, i) => (
        <div key={DAYS[i]} className="flex items-center gap-3">
          <label className="flex w-32 items-center gap-2">
            <input type="checkbox" checked={r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /> {DAYS[i]}
          </label>
          <input type="time" className={input} value={r.start} disabled={!r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <span className="text-slate-400">to</span>
          <input type="time" className={input} value={r.end} disabled={!r.on} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <label className="flex items-center gap-2">Minimum notice (hours) <input type="number" className={`${input} w-20`} value={notice} onChange={(e) => setNotice(Number(e.target.value))} /></label>
        <label className="flex items-center gap-2">Open for the next (days) <input type="number" className={`${input} w-20`} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} /></label>
        <button onClick={save} disabled={saving} className="rounded-md bg-teal-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-teal-700 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        {msg && <span className="text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
