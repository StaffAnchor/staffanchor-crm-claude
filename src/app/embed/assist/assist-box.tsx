"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistResult } from "@/lib/site-assist/classify";
import type { Intent } from "@/lib/site-assist/rules";

const copy = {
  heading: "Tell us what you need",
  sub: "Type it the way you would say it. We will point you to the right next step.",
  placeholder: "For example: we are hiring 5 SDRs for our SaaS company in Bangalore",
  examples: ["We are hiring 5 SDRs in Bangalore", "I am looking for an enterprise sales role in Mumbai", "I run a staffing agency"],
} as const;

const CLARIFY: { intent: Intent; label: string }[] = [
  { intent: "jobseeker", label: "I am looking for a job" },
  { intent: "employer", label: "I am hiring" },
  { intent: "referrer", label: "I want to refer people" },
  { intent: "vendor", label: "I run a staffing agency" },
  { intent: "other", label: "Something else" },
];

const ICON_PATHS: Record<string, string> = {
  profile: "M12 8a3 3 0 1 0 0 .01M6 20v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1",
  roles: "M3 7h18v12H3zM8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2",
  whatsapp: "M4 20l1.3-3.9A8 8 0 1 1 8.2 19zM9 10c0 3 2 5 5 5l1-1.5-2-1-1 .5c-.8-.4-1.4-1-1.8-1.8l.5-1-1-2z",
  score: "M5 19V9M12 19V5M19 19v-7",
  interview: "M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  writing: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  form: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  hiring: "M4 20V8l8-4 8 4v12M9 20v-6h6v6",
  leaders: "M12 4l2.5 5 5.5.8-4 3.9.9 5.5L12 16.5 7.1 19.2 8 13.7 4 9.8 9.5 9z",
  insight: "M4 19l5-6 4 3 7-9M16 7h4v4",
  circle: "M12 12m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 8v4l3 2",
  agency: "M3 20V10l6-4v14M9 20V8l8 3v9M3 20h18",
  contact: "M4 6h16v12H4zM4 7l8 6 8-6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  portal: "M5 4h14v16H5zM9 9h6M9 13h6",
  tools: "M14 6a4 4 0 1 0 4 4l-8 8a2.1 2.1 0 0 1-3-3z",
};

function StepIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ICON_PATHS.form} />
    </svg>
  );
}

async function call(payload: Record<string, unknown>) {
  const res = await fetch("/api/public/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function AssistBox() {
  const site = "main";
  const [text, setText] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);
  const [result, setResult] = useState<AssistResult | null>(null);
  const [sent, setSent] = useState("");
  const [showFix, setShowFix] = useState(false);
  const [okd, setOkd] = useState(false);
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
    setLimited(false);
    setResult(null);
    setShowFix(false);
    setOkd(false);
    setContactDone(false);
    setSent(m);
    const { ok, data } = await call({ action: "classify", message: m, site, t: Math.round(performance.now() - startedAt.current), website: hp });
    if (ok && data.result) setResult(data.result as AssistResult);
    else {
      setError(data.error ?? "Something went wrong. Please try again.");
      setLimited(data.limited === true);
    }
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

        {error && (
          <div className="mt-3">
            <p className={`text-[13px] ${limited ? "text-slate-600" : "text-rose-600"}`}>{error}</p>
            {limited && (
              <a
                href="https://wa.me/911204128963?text=Hi%20StaffAnchor"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-emerald-700"
              >
                Message us on WhatsApp
              </a>
            )}
          </div>
        )}

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
            ) : !result.sure && !okd ? (
              <>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Is this right?</p>
                <p className="mt-1 text-[15px] font-medium text-slate-900">{result.understood}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setOkd(true)} className="rounded-full bg-slate-900 px-4 py-1.5 text-[13.5px] font-semibold text-white hover:bg-slate-700">
                    Yes, that is right
                  </button>
                  <button type="button" onClick={() => setShowFix(true)} className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-[13.5px] text-slate-800 hover:bg-slate-100">
                    No, let me choose
                  </button>
                </div>
                {showFix && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {CLARIFY.map((o) => (
                      <button key={o.intent} type="button" onClick={() => void correct(o.intent)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[12.5px] text-slate-800 hover:bg-slate-100">
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Here is what we understood</p>
                <p className="mt-1 text-[15px] font-medium text-slate-900">{result.understood}</p>
                {result.steps.filter((s) => s.primary).map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_top"
                    onClick={confirmed}
                    className="mt-4 flex items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3.5 text-white shadow-sm transition hover:bg-blue-700"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                      <StepIcon name={s.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{s.label}</span>
                      <span className="block text-[12.5px] text-blue-50/90">{s.desc}</span>
                    </span>
                    <span aria-hidden="true" className="text-lg">&rarr;</span>
                  </a>
                ))}
                {result.steps.some((s) => s.primary && s.note) && (
                  <p className="mt-1.5 px-1 text-[12px] text-slate-500">{result.steps.find((s) => s.primary)?.note}</p>
                )}
                {result.steps.some((s) => !s.primary) && (
                  <>
                    <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">More that may help</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {result.steps.filter((s) => !s.primary).map((s) => (
                        <a
                          key={s.label}
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-blue-50 group-hover:text-blue-700">
                            <StepIcon name={s.icon} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold text-slate-900">{s.label}</span>
                            <span className="block text-[12px] leading-snug text-slate-500">{s.desc}</span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </>
                )}
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
