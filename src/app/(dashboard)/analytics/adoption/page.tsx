import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = { person: string; name: string; role: string; last_sign_in: string | null; last_action: string | null; active_days: number; calls_started: number; calls_logged: number; whatsapp_sent: number; notes_and_debriefs: number; tasks_done: number; actions: number };

const RANGES = [7, 14, 30];
const nowMs = () => Date.now();

function ago(iso: string | null) {
  if (!iso) return "Never";
  const h = Math.round((nowMs() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// Who is using the CRM and how. It is a way to see who needs help, not a ranking.
export default async function AdoptionPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 14;
  const supabase = await createClient();
  const { data } = await supabase.rpc("adoption_by_person", { p_days: days });
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, active_days: Number(r.active_days), calls_started: Number(r.calls_started), calls_logged: Number(r.calls_logged), whatsapp_sent: Number(r.whatsapp_sent), notes_and_debriefs: Number(r.notes_and_debriefs), tasks_done: Number(r.tasks_done), actions: Number(r.actions) }));
  const staff = rows.filter((r) => r.role !== "partner" || r.actions > 0);

  const activeRecently = staff.filter((r) => r.last_action && nowMs() - new Date(r.last_action).getTime() < 3 * 86_400_000).length;
  const started = staff.reduce((a, r) => a + r.calls_started, 0);
  const logged = staff.reduce((a, r) => a + r.calls_logged, 0);
  const nudges = staff
    .map((r) => {
      const notes: string[] = [];
      if (!r.last_action || nowMs() - new Date(r.last_action).getTime() > 3 * 86_400_000) notes.push(`no activity for ${r.last_action ? Math.round((nowMs() - new Date(r.last_action).getTime()) / 86_400_000) : "a long"} days`);
      if (r.calls_started > r.calls_logged) notes.push(`${r.calls_started - r.calls_logged} call${r.calls_started - r.calls_logged === 1 ? "" : "s"} started but not logged`);
      if (r.calls_started === 0) notes.push("no calls made from the CRM");
      return { name: r.name, notes };
    })
    .filter((x) => x.notes.length > 0);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-[20px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Adoption</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-slate-500">Who is using the CRM and how, over the last {days} days. It counts what people do in the app: calls, WhatsApp messages, notes, tasks. It is for spotting who needs help, not for ranking people.</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={`?days=${r}`} className={`rounded-full border px-3 py-1 text-[12.5px] font-medium ${r === days ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"}`}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[12px] text-slate-500">Active in the last 3 days</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">{activeRecently} <span className="text-[15px] font-medium text-slate-400">of {staff.length}</span></p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[12px] text-slate-500">Calls made from the CRM</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">{started}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[12px] text-slate-500">Of those, outcome logged</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">{started ? Math.round((logged / started) * 100) : "–"}{started ? <span className="ml-1 text-[14px] font-medium text-slate-500">%</span> : null}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[12px] text-slate-500">Tasks done</p>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums">{staff.reduce((a, r) => a + r.tasks_done, 0)}</p>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-4 py-2.5 font-medium">Person</th>
              <th className="px-3 py-2.5 font-medium">Last signed in</th>
              <th className="px-3 py-2.5 font-medium">Last action</th>
              <th className="px-3 py-2.5 text-right font-medium">Active days</th>
              <th className="px-3 py-2.5 text-right font-medium">Calls (logged)</th>
              <th className="px-3 py-2.5 text-right font-medium">WhatsApp sent</th>
              <th className="px-3 py-2.5 text-right font-medium">Notes</th>
              <th className="px-4 py-2.5 text-right font-medium">Tasks done</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((r) => (
              <tr key={r.person} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2.5"><span className="font-medium text-slate-900 dark:text-slate-100">{r.name}</span> <span className="text-xs capitalize text-slate-400">{r.role}</span></td>
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{ago(r.last_sign_in)}</td>
                <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{ago(r.last_action)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.active_days} of {days}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.calls_started} ({r.calls_logged})</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.whatsapp_sent}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.notes_and_debriefs}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.tasks_done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nudges.length > 0 && (
        <section className="mt-6">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Worth a conversation</h3>
          <ul className="mt-2 space-y-1.5 text-[13.5px] text-slate-700 dark:text-slate-200">
            {nudges.map((x) => (
              <li key={x.name}>
                <span className="font-medium">{x.name}</span>: {x.notes.join(", ")}.
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-2xl text-xs text-slate-400">A quiet week is often a sign of a slow week for roles, or something in the way. Ask what would make it easier before reading it as low effort.</p>
        </section>
      )}
      <p className="mt-6 max-w-2xl text-xs text-slate-400">What counts: notes and call debriefs written, WhatsApp messages sent from the CRM, calls started and logged from the CRM, tasks ticked off, and other recorded actions. Calls dialed from a phone&apos;s keypad and work done outside the CRM are not seen.</p>
    </div>
  );
}
