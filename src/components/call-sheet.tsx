"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import type { PendingCall } from "@/lib/calls";

type Outcome = "spoke" | "no_answer" | "busy" | "wrong_number";
type Interest = "yes" | "maybe" | "no";
type Next = "callback" | "send_role" | "submit" | "drop" | "none";

const OUTCOMES: { v: Outcome; label: string }[] = [
  { v: "spoke", label: "Spoke" },
  { v: "no_answer", label: "No answer" },
  { v: "busy", label: "Busy" },
  { v: "wrong_number", label: "Wrong number" },
];
const INTERESTS: { v: Interest; label: string }[] = [
  { v: "yes", label: "Interested" },
  { v: "maybe", label: "Maybe" },
  { v: "no", label: "Not interested" },
];
const NEXTS: { v: Next; label: string }[] = [
  { v: "callback", label: "Call back" },
  { v: "send_role", label: "Send the role" },
  { v: "submit", label: "Submit to client" },
  { v: "drop", label: "Drop" },
  { v: "none", label: "Nothing" },
];
const WHEN: { v: string; label: string }[] = [
  { v: "tomorrow", label: "Tomorrow" },
  { v: "two_days", label: "In 2 days" },
  { v: "next_week", label: "Next week" },
];

const chip = (on: boolean) =>
  `rounded-full border px-4 py-2.5 text-[14px] font-medium transition ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"}`;

// Appears after a call started from the CRM, wherever the recruiter is. Three taps: how it went, how interested they
// were, what happens next. A note is optional. Works on a phone: big buttons, sits at the bottom of the screen.
export default function CallSheet() {
  const [call, setCall] = useState<PendingCall | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [interest, setInterest] = useState<Interest | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  const [when, setWhen] = useState("tomorrow");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/calls/pending", { cache: "no-store" });
      const d = (await res.json()) as { call: PendingCall | null };
      setCall((cur) => (cur && d.call && cur.id === d.call.id ? cur : d.call));
    } catch {
      // Nothing to show if the check fails.
    }
  }, []);

  // Look when the page opens, when the tab comes back to the front (the call just ended), and when a call starts.
  useEffect(() => {
    const first = setTimeout(check, 0);
    const onVisible = () => document.visibilityState === "visible" && void check();
    const onStarted = () => setTimeout(check, 1500);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("sa-call-started", onStarted);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("sa-call-started", onStarted);
    };
  }, [check]);

  function reset() {
    setCall(null);
    setOutcome(null);
    setInterest(null);
    setNext(null);
    setWhen("tomorrow");
    setNote("");
    setError(null);
    setSaved(false);
  }

  async function save() {
    if (!call || !outcome) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/calls/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: call.id, outcome, interest: outcome === "spoke" ? interest : null, next: outcome === "spoke" ? next : "callback", callbackWhen: when, note }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string; candidateId?: string; hasNote?: boolean };
    if (!res.ok) {
      setBusy(false);
      return setError(d.error ?? "Couldn't save that.");
    }
    // A written note also becomes the structured debrief the system already knows how to read.
    if (d.hasNote && d.candidateId) void fetch(`/api/candidates/${d.candidateId}/debrief`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => {});
    setBusy(false);
    setSaved(true);
    setTimeout(reset, 1400);
  }

  async function discard() {
    if (!call) return;
    await fetch("/api/calls/discard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: call.id }) }).catch(() => {});
    reset();
  }

  if (!call) return null;
  const needsMore = outcome === "spoke" && (!interest || !next);
  const showWhen = outcome && (outcome !== "spoke" || next === "callback");

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3 sm:pb-5" role="dialog" aria-label="How did the call go?">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {saved ? (
          <p className="flex items-center justify-center gap-2 py-6 text-[15px] font-semibold text-emerald-700">
            <Check className="h-5 w-5" /> Saved. Nice work.
          </p>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">How did the call with {call.candidateName ?? "them"} go?</p>
            {call.role && <p className="mt-0.5 text-[12.5px] text-slate-500">About {call.role}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button key={o.v} type="button" onClick={() => setOutcome(o.v)} className={chip(outcome === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>

            {outcome === "spoke" && (
              <>
                <p className="mt-4 text-[12.5px] font-medium text-slate-500">Interest</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {INTERESTS.map((o) => (
                    <button key={o.v} type="button" onClick={() => setInterest(o.v)} className={chip(interest === o.v)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-[12.5px] font-medium text-slate-500">What next</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {NEXTS.map((o) => (
                    <button key={o.v} type="button" onClick={() => setNext(o.v)} className={chip(next === o.v)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {showWhen && (
              <>
                <p className="mt-4 text-[12.5px] font-medium text-slate-500">{outcome === "spoke" ? "Call back" : "Try again"}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WHEN.map((o) => (
                    <button key={o.v} type="button" onClick={() => setWhen(o.v)} className={chip(when === o.v)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {outcome === "spoke" && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anything worth remembering. Type, or use your keyboard's microphone."
                className="mt-4 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] dark:border-slate-600 dark:bg-slate-900"
              />
            )}

            {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}
            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={save} disabled={busy || !outcome || needsMore} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </button>
              <button type="button" onClick={discard} className="text-[13px] text-slate-500 hover:underline">
                I didn&apos;t call
              </button>
              <button type="button" onClick={reset} className="ml-auto text-[13px] text-slate-500 hover:underline">
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
