"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistResult } from "@/lib/site-assist/classify";
import type { Intent } from "@/lib/site-assist/rules";

const COPY = {
  main: {
    heading: "Tell us what you need",
    sub: "Type it the way you would say it. We will point you to the right next step.",
    placeholder: "For example: we are hiring 5 SDRs for our SaaS company in Bangalore",
    examples: ["We are hiring 5 SDRs in Bangalore", "I am looking for an enterprise sales role in Mumbai", "I run a staffing agency"],
  },
  jobs: {
    heading: "What are you looking for?",
    sub: "Type it in your own words. We will point you to the right next step.",
    placeholder: "For example: I am a sales manager with 8 years' experience, looking for a role in Pune",
    examples: ["I am looking for a sales role in Pune", "I want to refer a friend", "What is the status of my application?"],
  },
} as const;

const CLARIFY: { intent: Intent; label: string }[] = [
  { intent: "jobseeker", label: "I am looking for a job" },
  { intent: "employer", label: "I am hiring" },
  { intent: "referrer", label: "I want to refer people" },
  { intent: "vendor", label: "I run a staffing agency" },
  { intent: "other", label: "Something else" },
];

async function call(payload: Record<string, unknown>) {
  const res = await fetch("/api/public/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function AssistBox({ site }: { site: "main" | "jobs" }) {
  const copy = COPY[site];
  const [text, setText] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistResult | null>(null);
  const [sent, setSent] = useState("");
  const [showFix, setShowFix] = useState(false);
  const [contact, setContact] = useState("");
  const [contactDone, setContactDone] = useState(false);
  const startedAt = useRef(0);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  // Tell the page that embeds this box how tall it is, so it never shows a scrollbar.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof window === "undefined" || window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "sa-assist-height", height: Math.ceil(el.getBoundingClientRect().height) + 8 }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(el);
    post();
    return () => ro.disconnect();
  }, []);

  async function submit(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setShowFix(false);
    setContactDone(false);
    setSent(m);
    const { ok, data } = await call({ action: "classify", message: m, site, t: Math.round(performance.now() - startedAt.current), website: hp });
    if (ok && data.result) setResult(data.result as AssistResult);
    else setError(data.error ?? "Something went wrong. Please try again.");
    setBusy(false);
  }

  async function correct(intent: Intent) {
    setBusy(true);
    setShowFix(false);
    const { ok, data } = await call({ action: "correct", message: sent, site, intent, entities: result?.entities ?? {} });
    if (ok && data.result) setResult(data.result as AssistResult);
    setBusy(false);
  }

  function confirmed() {
    if (!result) return;
    void call({ action: "confirm", message: sent, site, intent: result.intent, entities: result.entities });
  }

  async function leaveContact() {
    if (!result || !contact.trim()) return;
    const { ok, data } = await call({ action: "contact", message: sent, site, intent: result.intent, entities: result.entities, contact });
    if (ok) setContactDone(true);
    else setError(data.error ?? "Please check the details and try again.");
  }

  return (
    <div ref={root} className="mx-auto w-full max-w-2xl p-1">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[17px] font-semibold text-slate-900">{copy.heading}</h2>
        <p className="mt-1 text-[13.5px] text-slate-500">{copy.sub}</p>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          {/* Hidden field: people never see it, bots fill it. */}
          <input value={hp} onChange={(e) => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            rows={3}
            placeholder={copy.placeholder}
            className="w-full resize-none rounded-xl border border-slate-300 px-3.5 py-3 text-[14.5px] text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {copy.examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setText(ex);
                  void submit(ex);
                }}
                className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-slate-600 hover:bg-slate-50"
              >
                {ex}
              </button>
            ))}
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="ml-auto rounded-xl bg-slate-900 px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Reading…" : "Send"}
            </button>
          </div>
        </form>

        {error && <p className="mt-3 text-[13px] text-rose-600">{error}</p>}

        {result && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            {result.clarify ? (
              <>
                <p className="text-[14px] font-medium text-slate-900">{result.clarify.question}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {result.clarify.options.map((o) => (
                    <button key={o.intent} type="button" onClick={() => void correct(o.intent)} className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[13.5px] text-slate-800 hover:bg-slate-100">
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Here is what we understood</p>
                <p className="mt-1 text-[15px] font-medium text-slate-900">{result.understood}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {result.steps.map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_top"
                      onClick={s.primary ? confirmed : undefined}
                      className={`rounded-xl px-4 py-2.5 text-[14px] font-semibold ${s.primary ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100"}`}
                    >
                      {s.label}
                      {s.primary && s.note && <span className="mt-0.5 block text-[12px] font-normal opacity-90">{s.note}</span>}
                    </a>
                  ))}
                </div>
                {(result.intent === "employer" || result.intent === "jobseeker") && (
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    {contactDone ? (
                      <p className="text-[13.5px] text-emerald-700">Thank you. A recruiter will reach out.</p>
                    ) : (
                      <>
                        <p className="text-[13px] text-slate-600">Prefer that we reach out? Leave an email or mobile number.</p>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={contact}
                            onChange={(e) => setContact(e.target.value)}
                            placeholder="Email or mobile number"
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[14px]"
                          />
                          <button type="button" onClick={() => void leaveContact()} disabled={!contact.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50">
                            Send
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="mt-3">
                  {showFix ? (
                    <div className="flex flex-wrap gap-2">
                      {CLARIFY.map((o) => (
                        <button key={o.intent} type="button" onClick={() => void correct(o.intent)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[12.5px] text-slate-800 hover:bg-slate-100">
                          {o.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowFix(true)} className="text-[12.5px] text-slate-500 underline-offset-2 hover:underline">
                      Not quite right?
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <p className="mt-4 text-[11.5px] leading-relaxed text-slate-400">
          Please do not type sensitive personal details. We use your message only to point you to the right step. See our{" "}
          <a href="https://staffanchor.com/privacy" target="_top" className="underline">
            privacy policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
