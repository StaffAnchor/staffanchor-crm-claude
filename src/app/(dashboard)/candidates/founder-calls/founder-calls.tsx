"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CallButton from "@/components/call-button";

export type QueueRow = {
  id: string;
  n: number;
  full_name: string;
  title: string | null;
  emp: string | null;
  city: string | null;
  exp: number | null;
  ctc: number | null;
  expected: number | null;
  notice: string | null;
  stab: number | null;
  sub: string | null;
  phone: string | null;
  open_to_work_at: string | null;
  sen: string | null;
  achievement: string | null;
  team: number | null;
  hf: string | null;
  full_cycle: string | null;
  flags: { kind: string; detail: string | null }[];
  score: number;
};
export type Progress = { spoke_today: number; tried_today: number; spoke_week: number };
export type Settings = { min_stability: number; min_ctc: number; per_day: number; per_week: number };

const SEN_LABEL: Record<string, string> = { director: "Director level", vp_plus: "VP and above", manager: "Manager level" };
const FLAG_LABEL: Record<string, string> = {
  gap: "Employment gap",
  short_stints: "Short stints",
  inconsistent: "Something in the CV doesn't add up",
  claim_not_backed: "A claim the CV doesn't back up",
};

// What to ask, built from what the CV reading found. Plain rules, nothing invented.
function probes(r: QueueRow): string[] {
  const out: string[] = [];
  out.push("Are you open to a move right now, and what would make you move?");
  if (r.achievement) out.push(`Walk me through: "${r.achievement.length > 130 ? r.achievement.slice(0, 127) + "…" : r.achievement}". How much was yours?`);
  if (r.hf === "unclear" || !r.hf) out.push("How much of it was new-logo hunting versus farming existing accounts?");
  if (r.team) out.push(`Team of ${r.team}: how many direct reports, and how many were quota-carrying?`);
  for (const f of r.flags.slice(0, 2)) {
    out.push(`${FLAG_LABEL[f.kind] ?? "Check"}${f.detail ? `: ${f.detail}` : ""}. What happened?`);
  }
  const notice = (r.notice ?? "").toLowerCase();
  if (/(60|90)/.test(notice)) out.push(`Notice is ${r.notice}: is it negotiable or can it be bought out?`);
  out.push(`Current ${r.ctc}L, expecting ${r.expected ? r.expected + "L" : "?"}: what is the fixed versus variable split?`);
  return out.slice(0, 6);
}

// The date read lives outside the component so the render-purity lint rule stays satisfied.
function inDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

const input = "w-20 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1 text-[13px]";

export default function FounderCalls({ rows, progress, settings }: { rows: QueueRow[]; progress: Progress; settings: Settings }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const remaining = Math.max(settings.per_day - progress.spoke_today, 0);
  const visible = rows.filter((r) => !hidden.has(r.id));
  const today = visible.slice(0, remaining);
  const upNext = visible.slice(remaining, remaining + Math.max(settings.per_week - progress.spoke_week - remaining, 0));

  async function saveSettings() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      await supabase.from("founder_call_settings").upsert({
        user_id: u.user.id,
        min_stability: Math.min(100, Math.max(0, Number(s.min_stability) || 0)),
        min_ctc: Math.max(0, Number(s.min_ctc) || 0),
        per_day: Math.min(20, Math.max(1, Number(s.per_day) || 4)),
        per_week: Math.min(100, Math.max(1, Number(s.per_week) || 20)),
        updated_at: new Date().toISOString(),
      });
    }
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function skip(id: string, days: number | null, reason: string) {
    setHidden((h) => new Set(h).add(id));
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("founder_call_skips").upsert({
      user_id: u.user.id,
      candidate_id: id,
      until: days ? inDaysIso(days) : null,
      reason,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Founder calls</h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Senior, complete, stable profiles to speak to yourself. Ranked on achievements, team led and a clean CV.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[13px]">
          <span>
            Today <b className="tabular-nums">{progress.spoke_today}</b> of {settings.per_day} spoken
          </span>
          <span>
            This week <b className="tabular-nums">{progress.spoke_week}</b> of {settings.per_week}
          </span>
          <button onClick={() => setOpen((o) => !o)} className="text-teal-600 hover:underline">
            Filters
          </button>
        </div>
      </div>

      {open && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 text-[13px] dark:border-slate-700 dark:bg-slate-900">
          <label className="space-y-1">
            <span className="block text-xs text-slate-500">Minimum stability (0–100)</span>
            <input type="number" className={input} value={s.min_stability} onChange={(e) => setS({ ...s, min_stability: Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-500">Current CTC above (lakh)</span>
            <input type="number" className={input} value={s.min_ctc} onChange={(e) => setS({ ...s, min_ctc: Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-500">Calls a day</span>
            <input type="number" className={input} value={s.per_day} onChange={(e) => setS({ ...s, per_day: Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-slate-500">Calls a week</span>
            <input type="number" className={input} value={s.per_week} onChange={(e) => setS({ ...s, per_week: Number(e.target.value) })} />
          </label>
          <button onClick={saveSettings} disabled={saving} className="rounded-md bg-teal-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <p className="basis-full text-xs text-slate-400">{rows.length} profiles currently match. People you have already spoken to (last 90 days) or tried yesterday are left out.</p>
        </div>
      )}

      {today.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-[14px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {remaining === 0 ? `That's your ${settings.per_day} for today. Nice work.` : "No profiles match these filters right now. Loosen them above."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {today.map((r) => (
            <article key={r.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/candidates/${r.id}`} target="_blank" className="text-[15px] font-semibold text-slate-900 hover:underline dark:text-slate-100">
                    {r.full_name}
                  </Link>
                  <p className="text-[13px] text-slate-600 dark:text-slate-300">
                    {r.title ?? "—"} · {r.emp ?? "—"}
                  </p>
                  <p className="text-xs text-slate-400">
                    #{r.n} · {r.city ?? "—"} · {r.sen ? SEN_LABEL[r.sen] ?? r.sen : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                  Stability {r.stab ?? "—"}
                </span>
              </div>
              <p className="text-[13px] text-slate-700 dark:text-slate-300">
                {r.exp}y · <b>{r.ctc}L</b> now{r.expected ? ` · expects ${r.expected}L` : ""} · notice {r.notice ?? "—"}
              </p>
              {r.flags.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">Check: {r.flags.map((f) => FLAG_LABEL[f.kind] ?? f.kind).join(", ")}</p>
              )}
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Ask on the call</p>
                <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-slate-600 dark:text-slate-300">
                  {probes(r).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <CallButton candidateId={r.id} phone={r.phone} source="founder_queue" label="Call" />
                <button onClick={() => skip(r.id, 14, "not_now")} className="text-[12.5px] text-slate-500 hover:underline">
                  Not now
                </button>
                <button onClick={() => skip(r.id, null, "not_a_fit")} className="text-[12.5px] text-slate-500 hover:underline">
                  Not a fit
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {upNext.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-[14px] font-semibold text-slate-900 dark:text-slate-100">Up next this week</h2>
          <ul className="divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
            {upNext.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <Link href={`/candidates/${r.id}`} target="_blank" className="font-medium text-slate-800 hover:underline dark:text-slate-200">
                    {r.full_name}
                  </Link>
                  <span className="ml-2 text-slate-400">
                    {r.title} · {r.emp} · {r.city}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {r.exp}y · {r.ctc}L · stability {r.stab}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
