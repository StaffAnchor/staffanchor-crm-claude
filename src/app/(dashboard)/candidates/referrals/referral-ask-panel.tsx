"use client";

import { useState } from "react";
import { Loader2, Send, Gift } from "lucide-react";
import { ChannelToggle, TemplateSetup, WhatsAppSample, type Channel } from "@/components/channel-toggle";

type Person = { id: string; name: string; reason: string };
type Preview = { channel: Channel; cap?: number; room?: number; perPress: number; people: Person[]; sample: { subject?: string; html?: string; text?: string } };

// Who is worth asking "who is the best seller you know?": people we placed and who have settled in, people who
// interviewed with a client, and people a recruiter rated top or strong. A person reviews the email and presses Send.
export default function ReferralAskPanel({
  endpoint = "/api/referrals/ask",
  heading = "Ask for referrals",
  blurb = "Sales people know other sales people. Ask the ones we placed, the ones who interviewed with a client, and the ones rated top or strong. Nobody is asked twice in 90 days.",
  templateKey = "referral",
}: {
  endpoint?: string;
  heading?: string;
  blurb?: string;
  templateKey?: "referral" | "referralRole";
} = {}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [needsTemplate, setNeedsTemplate] = useState(false);

  const post = (body: Record<string, unknown>) => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, ...body }) }).then(async (r) => ({ res: r, d: await r.json().catch(() => ({})) }));

  async function find() {
    setBusy(true);
    setMsg(null);
    setNeedsTemplate(false);
    const { res, d } = await post({ action: "preview" });
    setBusy(false);
    if (d.needsTemplate) {
      setPreview(null);
      return setNeedsTemplate(true);
    }
    if (!res.ok || d.ok === false) return setMsg(d.error ?? "Couldn't look that up.");
    setPreview(d as Preview);
    setPicked(new Set((d.people as Person[]).slice(0, Math.max(1, d.perPress ?? 20)).map((p) => p.id)));
  }

  async function send() {
    setBusy(true);
    const { res, d } = await post({ action: "send", ids: Array.from(picked) });
    setBusy(false);
    if (!res.ok || d.ok === false) return setMsg(d.error ?? "That didn't work. Nothing was sent.");
    setMsg(`Sent ${d.sent}${d.failed ? `, ${d.failed} failed` : ""}${d.skipped ? `, ${d.skipped} skipped` : ""}.${d.note ? ` ${d.note}` : ""}${d.over ? ` ${d.over} more were not included, press again for them.` : ""}${d.error ? ` ${d.error}` : ""}`);
    setPreview(null);
    setPicked(new Set());
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Gift className="h-4 w-4 text-teal-600" /> {heading}
        </h2>
        <span className="ml-auto"><ChannelToggle value={channel} onChange={(c) => { setChannel(c); setPreview(null); setNeedsTemplate(false); }} /></span>
        <button type="button" onClick={find} disabled={busy} className=" inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
          {busy && !preview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Find who to ask
        </button>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">{blurb}</p>
      {msg && <p className="mt-3 text-[13px] text-slate-700 dark:text-slate-200">{msg}</p>}
      {needsTemplate && <TemplateSetup which={templateKey} />}
      {preview && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            {preview.people.length === 0 ? (
              <p className="text-[13px] text-slate-400">Nobody is ready to be asked right now.</p>
            ) : (
              <>
                <p className="mb-2 text-[13px] text-slate-700 dark:text-slate-200">{preview.people.length} people are ready.{preview.channel === "email" ? ` ${preview.room} left under today's limit of ${preview.cap}.` : ` Up to ${preview.perPress} go per press. Meta charges per message.`}</p>
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {preview.people.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[13px] dark:border-slate-800">
                        <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="mt-1" />
                        <span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                          <span className="block text-xs text-slate-500">{p.reason}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={send} disabled={busy || picked.size === 0} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to {picked.size}
                </button>
              </>
            )}
          </div>
          {preview.channel === "whatsapp" && preview.sample.text ? (
            <WhatsAppSample text={preview.sample.text} />
          ) : (
            <div>
              <p className="mb-1 text-xs text-slate-500">Subject: {preview.sample.subject}</p>
              <iframe title="Email preview" srcDoc={preview.sample.html} sandbox="" className="h-[420px] w-full rounded-md border border-slate-200 bg-white dark:border-slate-700" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
