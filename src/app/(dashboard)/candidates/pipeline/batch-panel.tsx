"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircle, Send } from "lucide-react";

type Person = { id: string; name: string; fits: boolean; subGroup: string | null; score: number | null };
type Recipient = { id: string; name: string; route: string; message: string };

// Step 3: each day the next 20 people worth asking are ready. Review exactly what each person will get, untick anyone,
// and send. The assistant takes over the conversation from there.
export default function BatchPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  async function prepare() {
    setBusy(true);
    setMsg(null);
    setRecipients(null);
    const res = await fetch("/api/intake/batch", { cache: "no-store" });
    const d = (await res.json().catch(() => ({}))) as { people?: Person[]; error?: string };
    if (!res.ok || !d.people) {
      setBusy(false);
      return setMsg(d.error ?? "Couldn't prepare the batch.");
    }
    setPeople(d.people);
    if (d.people.length === 0) {
      setBusy(false);
      return setMsg("Nobody is waiting to be asked right now.");
    }
    // The exact messages, worked out the same way as when they are sent.
    const pr = await fetch("/api/whatsapp/ask-bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateIds: d.people.map((p) => p.id), dryRun: true }) });
    const pd = (await pr.json().catch(() => ({}))) as { recipients?: Recipient[]; skipped?: Record<string, number>; error?: string };
    setBusy(false);
    if (!pr.ok) return setMsg(pd.error ?? "Couldn't check these people.");
    setRecipients(pd.recipients ?? []);
    const sk = Object.values(pd.skipped ?? {}).reduce((a, b) => a + b, 0);
    setSkipped(sk ? `${sk} skipped (already asked recently, opted out, or nothing missing).` : null);
    setLeft(new Set());
  }

  async function send() {
    const ids = (recipients ?? []).filter((r) => !left.has(r.id)).map((r) => r.id);
    if (ids.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/whatsapp/ask-bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateIds: ids }) });
    const d = (await res.json().catch(() => ({}))) as { sentWindow?: number; sentTemplate?: number; failed?: number; error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(d.error ?? "That didn't work. Nothing was sent.");
    setMsg(`Sent. ${d.sentWindow ?? 0} in open chats and ${d.sentTemplate ?? 0} as the approved template${d.failed ? `, ${d.failed} failed` : ""}. The assistant handles their replies.`);
    setRecipients(null);
    setPeople(null);
    router.refresh();
  }

  const fits = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <MessageCircle className="h-4 w-4 text-teal-600" /> Today&apos;s batch
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">The next 20 people to ask for their missing details, best first: people who fit an open role, then those closest to ready.</p>
        </div>
        <button type="button" onClick={prepare} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
          {busy && !recipients ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Prepare today&apos;s batch
        </button>
      </div>
      {msg && <p className="mt-3 text-[13px] text-slate-700 dark:text-slate-200">{msg}</p>}
      {recipients && (
        <div className="mt-4">
          {skipped && <p className="mb-2 text-xs text-slate-500">{skipped}</p>}
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {recipients.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-100 p-3 text-[13px] dark:border-slate-800">
                <label className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                  <input type="checkbox" checked={!left.has(r.id)} onChange={() => setLeft((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} />
                  {r.name}
                  {fits.get(r.id)?.fits && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Fits an open role</span>}
                  <span className="text-xs font-normal text-slate-500">· {r.route === "window" ? "open chat, free" : "approved template"}</span>
                </label>
                <p className="mt-1.5 whitespace-pre-wrap pl-6 text-slate-600 dark:text-slate-300">{r.message}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" onClick={send} disabled={busy || recipients.length === left.size} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to {recipients.length - left.size}
            </button>
            <span className="text-xs text-slate-500">Sent from StaffAnchor&apos;s number. Meta charges per template message.</span>
          </div>
        </div>
      )}
    </section>
  );
}
