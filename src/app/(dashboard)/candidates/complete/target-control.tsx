"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type Target = { due_on: string; baseline_incomplete: number };

const dayMs = 86_400_000;
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const daysLeft = (due: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${istToday()}T00:00:00Z`)) / dayMs);
const pretty = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

// A deadline for finishing one practice: "complete these 200 in 3 days". Shows how many are left and the pace needed per day.
export default function TargetControl({ group, by, bucket, incomplete, target, compact = false }: { group: string; by: string; bucket: string; incomplete: number; target: Target | null; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Math.max(1, Math.min(60, Number(days) || 3));
    const due = new Date(Date.now() + 5.5 * 3_600_000 + n * dayMs).toISOString().slice(0, 10);
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("completion_targets")
      .upsert({ profile_group: group, by_field: by, bucket, due_on: due, baseline_incomplete: incomplete, set_by: user?.id ?? null }, { onConflict: "profile_group,by_field,bucket" });
    setBusy(false);
    if (err) return setError("Couldn't save the deadline. Try again.");
    setOpen(false);
    router.refresh();
  }
  async function clear() {
    setBusy(true);
    await createClient().from("completion_targets").delete().eq("profile_group", group).eq("by_field", by).eq("bucket", bucket);
    setBusy(false);
    router.refresh();
  }

  if (target && !open) {
    const left = daysLeft(target.due_on);
    const done = Math.max(0, target.baseline_incomplete - incomplete);
    const finished = incomplete === 0;
    const late = left < 0 && !finished;
    const perDay = left > 0 ? Math.ceil(incomplete / left) : incomplete;
    return (
      <div className={`text-[12px] ${late ? "text-rose-700 dark:text-rose-300" : "text-slate-600 dark:text-slate-300"}`}>
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {finished ? "Target met" : late ? `Overdue by ${-left} ${-left === 1 ? "day" : "days"}` : left === 0 ? "Due today" : `Due ${pretty(target.due_on)} · ${left} ${left === 1 ? "day" : "days"} left`}
        </p>
        {!compact && !finished && <p className="text-slate-500">{done} of {target.baseline_incomplete} done{left > 0 ? ` · ${perDay} a day to finish on time` : ""}</p>}
        <p className="mt-0.5 space-x-2">
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-teal-700 hover:underline dark:text-teal-300">Change</button>
          <button type="button" onClick={clear} disabled={busy} className="text-slate-400 hover:underline">Remove</button>
        </p>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[12px] font-medium text-teal-700 hover:underline dark:text-teal-300">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Set a deadline
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="text-slate-600 dark:text-slate-300">Finish {incomplete} in</span>
      <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} className="w-14 rounded-md border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-600 dark:bg-slate-900" aria-label="Days to finish" />
      <span className="text-slate-600 dark:text-slate-300">days</span>
      <button type="button" onClick={save} disabled={busy} className="rounded-full bg-teal-600 px-3 py-0.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Saving…" : "Set"}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:underline">Cancel</button>
      {error && <span className="w-full text-rose-600">{error}</span>}
    </div>
  );
}
