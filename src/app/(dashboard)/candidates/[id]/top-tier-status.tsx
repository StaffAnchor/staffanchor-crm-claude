"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, MessageCircle, Star, X } from "lucide-react";

type Preview = {
  email: { available: boolean; why: string | null; subject: string | null; text: string | null };
  whatsapp: { available: boolean; why: string | null; text: string | null };
};

export type TopTierData = {
  isSales: boolean;
  payRatio: number | null;
  expYears: number | null;
  ctc: number | null;
  expOk: boolean;
  ratioOk: boolean;
  comm: string | null;
  openFresh: boolean;
  resting: boolean;
  tier: "top" | "ask_open" | "worth_a_call" | null;
};

// Top tier means a strong sales person who can crack interviews: 3+ years, pay-to-experience ratio of 1.5 or more,
// communication rated good on a call, and open to work. This shows where this person stands on each test and the one tap
// that moves them along. Nothing is sent until the person presses Send on a preview.
export default function TopTierStatus({ candidateId, data }: { candidateId: string; data: TopTierData }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"email" | "whatsapp" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!data.isSales) return null;
  const passesNumbers = data.expOk && data.ratioOk;
  const top = data.tier === "top";

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/top-tier`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string } & Partial<Preview>;
    } finally {
      setBusy(false);
    }
  }
  async function act(body: Record<string, unknown>) {
    const d = await call(body);
    setMessage({ ok: !!d.ok, text: d.message ?? d.error ?? "That didn't work." });
    if (d.ok) {
      setMode(null);
      router.refresh();
    }
  }
  async function openPreview(which: "email" | "whatsapp") {
    setMode(which);
    if (preview) return;
    const d = await call({ action: "preview" });
    if (d.ok) setPreview(d as unknown as Preview);
    else setMessage({ ok: false, text: d.error ?? "Couldn't load the preview." });
  }

  const tick = (ok: boolean | null) =>
    ok === null ? <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-300" /> : ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-rose-500" />;
  const chip = (on: boolean, tone: "good" | "okay" | "weak") =>
    `rounded-full border px-2.5 py-0.5 text-[12px] font-medium disabled:opacity-50 ${
      on
        ? tone === "good" ? "border-emerald-600 bg-emerald-600 text-white" : tone === "okay" ? "border-amber-500 bg-amber-500 text-white" : "border-rose-500 bg-rose-500 text-white"
        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
    }`;
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";
  const active = mode ? preview?.[mode] : null;

  const ratioText =
    data.payRatio === null
      ? "Current pay or experience is missing, so the ratio can't be worked out. Ask for CTC first."
      : `${data.payRatio.toFixed(2)} (₹${data.ctc}L over ${data.expYears} years). ${data.ratioOk ? (data.payRatio > 6 ? "Very high. Check the CTC is right before relying on this." : "At or above 1.5.") : "Below 1.5."}`;

  return (
    <div className={`mt-3 rounded-ros-lg border px-3.5 py-3 text-[12.5px] ${top ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Star className={`h-3.5 w-3.5 ${top ? "fill-emerald-500 text-emerald-600" : "fill-amber-400 text-amber-500"}`} />
        <span className="font-semibold text-slate-900 dark:text-slate-100">{top ? "Top tier" : data.tier === "ask_open" ? "Strong. Confirm they are open" : data.tier === "worth_a_call" ? "Worth a call" : "Not top tier"}</span>
        <span className="text-slate-500 dark:text-slate-400">{top ? "Put them first for any new role." : data.tier === "worth_a_call" ? "Passes pay and experience. Call, then rate how they came across." : data.tier === "ask_open" ? "Communication is good. One thing left." : ""}</span>
      </div>

      <ul className="space-y-1.5 text-slate-700 dark:text-slate-200">
        <li className="flex items-start gap-2">{tick(data.expOk)}<span><b>Experience:</b> {data.expYears ?? "unknown"} years{data.expOk ? "" : ". Top tier needs 3 or more."}</span></li>
        <li className="flex items-start gap-2">{tick(data.payRatio === null ? null : data.ratioOk)}<span><b>Pay-to-experience ratio:</b> {ratioText}</span></li>
        <li className="flex flex-wrap items-center gap-2">
          {tick(data.comm === null ? null : data.comm === "good")}
          <span><b>Communication:</b> {data.comm ? `rated ${data.comm}` : "not rated yet"}</span>
          <span className="flex items-center gap-1">
            {(["good", "okay", "weak"] as const).map((v) => (
              <button key={v} type="button" disabled={busy} onClick={() => act({ action: "rate_communication", value: v })} className={chip(data.comm === v, v)}>
                {v === "good" ? "Good" : v === "okay" ? "Okay" : "Weak"}
              </button>
            ))}
          </span>
        </li>
        <li className="flex flex-wrap items-center gap-2">
          {tick(data.openFresh ? true : data.resting ? false : null)}
          <span><b>Open to work:</b> {data.openFresh ? "confirmed in the last 90 days" : data.resting ? "said not now, resting" : "not confirmed"}</span>
          <span className="flex items-center gap-1">
            <button type="button" disabled={busy} onClick={() => act({ action: "mark_open" })} className={chip(data.openFresh, "good")} title="Use after they told you they are looking">Looking</button>
            <button type="button" disabled={busy} onClick={() => act({ action: "not_now" })} className={chip(data.resting, "weak")} title="Rests them for 90 days">Not now</button>
          </span>
        </li>
      </ul>

      {passesNumbers && !data.openFresh && !data.resting && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5 dark:border-slate-700">
          <span className="text-slate-500">Or ask them:</span>
          <button type="button" disabled={busy} onClick={() => openPreview("email")} className={btn}><Mail className="h-3.5 w-3.5" /> Email</button>
          <button type="button" disabled={busy} onClick={() => openPreview("whatsapp")} className={btn}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</button>
        </div>
      )}

      {mode && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {!preview ? (
            <p className="text-slate-500">Loading the preview…</p>
          ) : active && active.available ? (
            <>
              <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">{mode === "email" ? "This email will go out" : "This WhatsApp will go out"}</p>
              {mode === "email" && preview.email.subject && <p className="mb-1 font-medium">{preview.email.subject}</p>}
              <p className="max-h-40 overflow-auto whitespace-pre-wrap text-slate-600 dark:text-slate-300">{active.text}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => act({ action: mode })} className="rounded-full bg-teal-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
                <button type="button" onClick={() => setMode(null)} className="text-[12.5px] text-slate-500 hover:underline">Cancel</button>
              </div>
            </>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">
              {active?.why ?? "Not available."} <button type="button" onClick={() => setMode(null)} className="text-teal-700 hover:underline dark:text-teal-300">Close</button>
            </p>
          )}
        </div>
      )}
      {message && (
        <p className={`mt-2 flex items-center gap-1.5 font-medium ${message.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {message.ok && <Check className="h-3.5 w-3.5" />} {message.text}
        </p>
      )}
    </div>
  );
}
