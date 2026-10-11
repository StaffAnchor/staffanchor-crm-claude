"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Send } from "lucide-react";
import { MISSING_LABEL } from "@/lib/readiness";

type Props = {
  sender: string | null;
  configured: boolean;
  stats: { eligible: number; sent24h: number; sentTotal: number; failedTotal: number; optedOut: number; welcomeQueued: number };
  cap: number;
  next: { id: string; name: string; asks: string[]; emailHint: string }[];
  preview: { subject: string; html: string };
};

export default function OutreachView({ sender, configured, stats, cap, next, preview }: Props) {
  const router = useRouter();
  const room = Math.max(0, cap - stats.sent24h);
  const [count, setCount] = useState(Math.min(30, Math.max(room, 1)));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    if (!window.confirm(`Send ${count} email${count === 1 ? "" : "s"} from ${sender ?? "the CRM mailbox"} now?`)) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/outreach/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setResult(d.error ?? "Couldn't send.");
      else
        setResult(
          d.note ??
            `Sent ${d.sent}${d.failed ? `, ${d.failed} failed` : ""}.${d.stoppedEarly ? " Stopped early after repeated failures; check the mailbox before trying again." : ""}`
        );
      router.refresh();
    } catch {
      setResult("Network error. Check the numbers above before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold text-slate-900 dark:text-slate-100">
          <Mail className="h-5 w-5 text-slate-400" /> Profile details outreach
        </h1>
        <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
          Asks candidates for the details mandates screen on (current CTC, expected CTC, notice period). Nothing goes out unless you press Send, in small batches, from {sender ?? "the CRM mailbox"}.
        </p>
      </div>

      {!configured && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">Email sending isn&apos;t fully configured, so Send is disabled.</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
        {[
          ["Eligible now", stats.eligible],
          [`Sent in last 24h (limit ${cap})`, stats.sent24h],
          ["Sent in total", stats.sentTotal],
          ["Failed", stats.failedTotal],
          ["Opted out", stats.optedOut],
          ["Welcome emails queued (go first)", stats.welcomeQueued],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-lg border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[22px] font-bold tabular-nums text-slate-900 dark:text-slate-100">{n}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-lg border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-[13px] text-slate-700 dark:text-slate-200">
            Send next{" "}
            <input
              type="number"
              min={1}
              max={Math.max(1, Math.min(30, room))}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(30, room || 1, Number(e.target.value) || 1)))}
              className="mx-1 w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-[13px] dark:border-slate-600 dark:bg-slate-900"
            />{" "}
            emails
          </label>
          <button
            onClick={send}
            disabled={busy || !configured || room <= 0 || stats.eligible === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send
          </button>
          <span className="text-[12px] text-slate-500 dark:text-slate-400">
            {room > 0 ? `${room} left under today's limit.` : "Today's limit is used up. It frees up on a rolling 24 hours."} The limit is shared with welcome emails for bulk uploads (sent automatically once a day at 10:00 IST, or first when you press Send) and automatic profile reminders, and grows after a week and again after two.
          </span>
        </div>
        {result && <p className="mt-3 text-[13px] text-slate-700 dark:text-slate-200">{result}</p>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Next in line</h2>
          <p className="mb-2 text-[12px] text-slate-500 dark:text-slate-400">Sales profiles first, then newest. Nobody is emailed twice within 30 days, and anyone who opted out is skipped.</p>
          <ul className="space-y-1.5">
            {next.length === 0 && <li className="text-[13px] text-slate-400">Nobody eligible right now.</li>}
            {next.map((n) => (
              <li key={n.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-[13px] dark:border-slate-800 dark:bg-slate-900">
                <span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{n.name}</span> <span className="text-slate-400">{n.emailHint}</span>
                </span>
                <span className="text-[11.5px] text-slate-500">{n.asks.map((a) => MISSING_LABEL[a] ?? a).join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">What they receive</h2>
          <div className="rounded-lg border border-slate-100 bg-white p-4 text-[13px] dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-[12px] text-slate-500">Subject: {preview.subject}</p>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[560px] w-full rounded-md border border-slate-200 bg-white dark:border-slate-700" />
          </div>
        </section>
      </div>
    </div>
  );
}
