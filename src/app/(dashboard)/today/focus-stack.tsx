"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, MessageCircle, Phone } from "lucide-react";
import CallButton from "@/components/call-button";
import { createClient } from "@/lib/supabase/client";
import type { FocusCard } from "@/lib/today-focus";

const KIND_LABEL: Record<FocusCard["kind"], string> = { chat: "WhatsApp", callback: "Call back", task: "Task", decision: "Role", money: "Payment", checkin: "Check-in" };
const KIND_STYLE: Record<FocusCard["kind"], string> = {
  chat: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  callback: "bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300",
  task: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  decision: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  money: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  checkin: "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300",
};

// One thing at a time: the next most useful action, with its button. Do it, tap Done (or Not now), and the next one
// slides in. When the stack is empty it says so. Built to be thumb-friendly on a phone.
export default function FocusStack({ cards, greeting, firstName, fees }: { cards: FocusCard[]; greeting: string; firstName: string; fees: { amount: string; people: number } | null }) {
  const router = useRouter();
  const [queue, setQueue] = useState<FocusCard[]>(cards);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const total = cards.length;
  const current = queue[0] ?? null;
  const upcoming = queue.slice(1, 3);

  async function finish() {
    if (!current) return;
    setBusy(true);
    if (current.taskId) await createClient().rpc("resolve_inbox_item", { p_id: current.taskId, p_status: "done" });
    setBusy(false);
    setDone((d) => d + 1);
    setQueue((q) => q.slice(1));
    router.refresh();
  }
  // Not now: it goes to the back of today's list, nothing is lost.
  const later = () => setQueue((q) => (q.length > 1 ? [...q.slice(1), q[0]] : q));

  const minutes = Math.max(1, Math.round(queue.length * 2));

  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-100">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            {current ? `${queue.length} ${queue.length === 1 ? "thing" : "things"} worth doing now. About ${minutes} minutes.` : total === 0 ? "Nothing needs you right now." : "You're clear for now."}
          </p>
        </div>
        {fees && (
          <div className="text-right">
            <p className="text-[12px] text-slate-500">Fees in play with clients</p>
            <p className="text-[22px] font-semibold leading-tight text-slate-900 dark:text-slate-100">{fees.amount}</p>
            <p className="text-[12px] text-slate-400">{fees.people} {fees.people === 1 ? "candidate" : "candidates"}, if all are placed</p>
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {cards.map((c, i) => (
            <span key={c.id} className={`h-1 flex-1 rounded-full ${i < done ? "bg-emerald-500" : i === done ? "bg-teal-500" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>
      )}

      {current ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${KIND_STYLE[current.kind]}`}>{KIND_LABEL[current.kind]}</span>
            {current.value && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{current.value}</span>}
            <span className="text-[12px] text-slate-400">{done + 1} of {total}</span>
          </div>
          <p className="mt-3 text-[19px] font-semibold leading-snug text-slate-900 dark:text-slate-100">{current.title}</p>
          <p className="mt-1.5 text-[14px] leading-6 text-slate-600 dark:text-slate-300">{current.why}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {current.candidate?.phone && current.kind !== "chat" && (
              <CallButton candidateId={current.candidate.id} mandateId={current.mandateId} phone={current.candidate.phone} className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-teal-600 px-6 text-[15px] font-semibold text-white hover:bg-teal-500" />
            )}
            <Link href={current.href} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-[46px] items-center gap-2 rounded-full px-6 text-[15px] font-semibold ${current.candidate?.phone && current.kind !== "chat" ? "border border-slate-300 text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800" : "bg-teal-600 text-white hover:bg-teal-500"}`}>
              {current.kind === "chat" ? <MessageCircle className="h-4 w-4" /> : null}
              {current.actionLabel}
              {current.kind !== "chat" && <ArrowRight className="h-4 w-4" />}
            </Link>
            {current.candidate?.phone && current.kind === "chat" && (
              <CallButton candidateId={current.candidate.id} phone={current.candidate.phone} label="Call instead" className="inline-flex min-h-[46px] items-center gap-2 rounded-full border border-slate-300 px-5 text-[15px] font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800" />
            )}
          </div>

          <div className="mt-5 flex items-center gap-4 border-t border-slate-100 pt-4 text-[14px] dark:border-slate-800">
            <button type="button" onClick={finish} disabled={busy} className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 hover:underline dark:text-emerald-300">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Done, next
            </button>
            {queue.length > 1 && (
              <button type="button" onClick={later} className="text-slate-500 hover:underline">
                Not now
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
          <Check className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-[18px] font-semibold text-slate-900 dark:text-slate-100">{done > 0 ? `That's ${done} done. You're clear.` : "You're all clear."}</p>
          <p className="mt-1 text-[14px] text-slate-600 dark:text-slate-300">Nothing is waiting on you. The roles and tasks below are still there if you want to get ahead.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {upcoming.map((c, i) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-[12px] text-slate-400">{i === 0 ? "Next" : "Then"}</p>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[14px] text-slate-800 dark:text-slate-100">
                {c.candidate?.phone && c.kind !== "chat" ? <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" /> : null}
                <span className="truncate">{c.title}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
