"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistResult } from "@/lib/site-assist/classify";
import { runRules, understoodSentence, type Entities, type Intent } from "@/lib/site-assist/rules";
import { stepsFor, type Step } from "@/lib/site-assist/steps";
import { whatsappEntryLink } from "@/lib/whatsapp-entry";

// The floating chat. It never writes its own answers: every sentence is either fixed text below or built
// from the structured result of the same checked brain the website message box uses. Free text is read by
// /api/public/assist (rules first, AI only when unsure). Short replies to the follow-up questions are read
// locally and cost nothing.

type Msg = { from: "bot" | "me"; text: string };
type Ask = "role" | "city" | "headcount" | null;

const OPTIONS: { intent: Intent; label: string }[] = [
  { intent: "jobseeker", label: "I am looking for a job" },
  { intent: "employer", label: "I am hiring" },
  { intent: "referrer", label: "I want to refer people" },
  { intent: "vendor", label: "I run a staffing agency" },
  { intent: "status", label: "Check my application" },
];

const GREETING = "Hi, I am the StaffAnchor assistant. Tell us what you are looking for, or pick one below.";

async function call(payload: Record<string, unknown>) {
  const res = await fetch("/api/public/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

const WA_ICON = "M4 20l1.3-3.9A8 8 0 1 1 8.2 19zM9 10c0 3 2 5 5 5l1-1.5-2-1-1 .5c-.8-.4-1.4-1-1.8-1.8l.5-1-1-2z";

export default function ChatBot({ site }: { site: "main" | "jobs" }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: GREETING }]);
  const [text, setText] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [ent, setEnt] = useState<Entities>({});
  const [ask, setAsk] = useState<Ask>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [first, setFirst] = useState("");
  const [contact, setContact] = useState("");
  const [contactDone, setContactDone] = useState(false);
  const [limited, setLimited] = useState(false);
  const startedAt = useRef(0);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    startedAt.current = performance.now();
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, steps, busy, ask, contactDone]);

  const say = (t: string) => setMsgs((m) => [...m, { from: "bot", text: t }]);
  const me = (t: string) => setMsgs((m) => [...m, { from: "me", text: t }]);

  // What we still need to know before the next step is worth showing. Jobseekers: role, then city.
  // Employers: role, then city (headcount is taken if they say it, never forced).
  function nextAsk(i: Intent, e: Entities): Ask {
    if (i === "jobseeker" || i === "employer") {
      if (!e.role) return "role";
      if (!e.city) return "city";
    }
    return null;
  }

  function conclude(i: Intent, e: Entities, original: string) {
    const s = stepsFor(i, e, original || understoodSentence(i, e));
    setSteps(s);
    setAsk(null);
    const sentence = understoodSentence(i, e);
    say(
      i === "employer"
        ? `${sentence} A recruiter confirms the brief with you, then the first shortlist follows within 72 hours. Share the role below, or leave your number and we will call you.`
        : i === "jobseeker"
        ? `${sentence} The quickest way is a profile: upload your CV and we match you to roles from it.`
        : i === "status"
        ? "For your privacy we do not show application details here. A recruiter can look it up for you."
        : sentence || "Here is where I would start."
    );
    void call({ action: "confirm", message: original || sentence || "chat", site, intent: i, entities: e });
  }

  function proceed(i: Intent, e: Entities, original: string) {
    setIntent(i);
    setEnt(e);
    const a = nextAsk(i, e);
    if (!a) return conclude(i, e, original);
    setAsk(a);
    if (i === "employer") say(a === "role" ? "Got it, you are hiring. Which role is it?" : `Which city is the ${e.role ?? "role"} based in?`);
    else say(a === "role" ? "Great. What kind of role are you looking for? For example: enterprise sales, SDR, sales head." : `Which city would you like to work in? (or "remote")`);
  }

  async function classify(message: string) {
    setBusy(true);
    const { ok, data } = await call({ action: "classify", message, site, t: Math.round(performance.now() - startedAt.current), website: hp });
    setBusy(false);
    if (!ok || !data.result) {
      if (data.limited) {
        setLimited(true);
        say("You have sent quite a few messages in a short time. Please message us on WhatsApp and a person will reply.");
      } else say(data.error ?? "Sorry, something went wrong. Please try again, or message us on WhatsApp.");
      return;
    }
    const r = data.result as AssistResult;
    if (r.sure && r.intent !== "other") {
      proceed(r.intent, r.entities, message);
    } else {
      setEnt((prev) => ({ ...prev, ...r.entities }));
      say("I want to point you the right way. Which of these is closest?");
    }
  }

  function choose(i: Intent, label: string) {
    if (busy) return;
    me(label);
    if (!first) setFirst(label);
    void call({ action: "correct", message: label, site, intent: i, entities: ent });
    proceed(i, ent, label);
  }

  async function send(raw: string) {
    const m = raw.trim().slice(0, 500);
    if (!m || busy) return;
    setText("");
    me(m);
    if (!first) setFirst(m);
    // An answer to a follow-up question is read locally.
    if (ask && intent) {
      const r = runRules(m);
      const e: Entities = { ...ent, ...r.entities };
      // Keep the visitor's own words for the role, so we repeat back what they said, not our label for it.
      if (ask === "role") e.role = m.replace(/[^\p{L}\p{N}\s/&+.,-]/gu, "").slice(0, 60).trim() || e.role;
      if (ask === "city" && !e.city) e.city = /^(remote|anywhere|any)$/i.test(m) ? "Remote" : m.replace(/[^\p{L}\s.-]/gu, "").slice(0, 40).trim() || undefined;
      // If they changed topic ("actually I want to hire"), read it properly instead.
      if (r.intent && r.intent !== intent && r.confidence >= 0.8) return classify(m);
      setEnt(e);
      const a = nextAsk(intent, e);
      if (a && a === ask) return conclude(intent, e, first); // asked twice, do not nag
      if (a) {
        setAsk(a);
        return say(a === "city" ? `Which city is the ${e.role ?? "role"} based in?` : "Which role is it?");
      }
      return conclude(intent, e, first);
    }
    if (intent && steps.length) return classify(m); // new question after the answer
    return classify(m);
  }

  async function leaveContact() {
    if (!intent || !contact.trim()) return;
    const { ok, data } = await call({ action: "contact", message: first || "chat", site, intent, entities: ent, contact });
    if (ok) {
      setContactDone(true);
      say("Thank you. A recruiter will reach out to you soon.");
    } else say(data.error ?? "Please check the number or email and try again.");
  }

  function restart() {
    setMsgs([{ from: "bot", text: GREETING }]);
    setIntent(null);
    setEnt({});
    setAsk(null);
    setSteps([]);
    setFirst("");
    setContact("");
    setContactDone(false);
    setLimited(false);
  }

  const showOptions = !intent && !busy;
  // The WhatsApp message carries what the visitor told us, so the recruiter starts with the full picture.
  const where = ent.city ? ` in ${ent.city}` : "";
  const waText =
    intent === "employer" && ent.role
      ? `Hi StaffAnchor, I am hiring ${ent.headcount ? `${ent.headcount} ` : /^[aeiou]/i.test(ent.role) ? "an " : "a "}${ent.role}${where}.`
      : intent === "jobseeker" && ent.role
      ? `Hi StaffAnchor, I am looking for ${/^[aeiou]/i.test(ent.role) ? "an" : "a"} ${ent.role} role${where}.`
      : `Hi StaffAnchor, ${first || "I would like some help"}`;

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-[14.5px] font-semibold">StaffAnchor</div>
          <div className="text-[12px] text-slate-500">Ask us anything about jobs or hiring</div>
        </div>
        <div className="flex items-center gap-1">
          {intent && (
            <button type="button" onClick={restart} className="rounded-md px-2 py-1 text-[12px] text-slate-500 hover:bg-slate-100">
              Start over
            </button>
          )}
          <button type="button" aria-label="Close chat" onClick={() => window.parent.postMessage({ type: "sa-chat-close" }, "*")} className="rounded-md px-2 py-1 text-[18px] leading-none text-slate-500 hover:bg-slate-100">
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${m.from === "me" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800"}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-[13px] text-slate-400">Reading…</div>}

        {showOptions && (
          <div className="flex flex-wrap gap-2">
            {(site === "jobs" ? [OPTIONS[0], OPTIONS[4], OPTIONS[1], OPTIONS[2], OPTIONS[3]] : OPTIONS).map((o) => (
              <button key={o.intent} type="button" onClick={() => choose(o.intent, o.label)} className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[13.5px] text-slate-800 hover:bg-slate-50">
                {o.label}
              </button>
            ))}
          </div>
        )}

        {steps.length > 0 && !ask && (
          <div className="space-y-2">
            {steps.slice(0, 3).map((s) => (
              <a
                key={s.href}
                href={s.href.startsWith("https://wa.me") ? whatsappEntryLink(waText) : s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block rounded-xl border px-3.5 py-2.5 text-[13.5px] ${s.primary ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
              >
                <div className="font-semibold">{s.label}</div>
                <div className={`text-[12.5px] ${s.primary ? "text-slate-200" : "text-slate-500"}`}>{s.desc}</div>
              </a>
            ))}
            <a href={whatsappEntryLink(waText)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-emerald-700">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={WA_ICON} />
              </svg>
              Continue on WhatsApp
            </a>
            {intent === "employer" && !contactDone && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void leaveContact();
                }}
              >
                <input value={contact} onChange={(e) => setContact(e.target.value.slice(0, 80))} placeholder="Work email or mobile" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-[13.5px] focus:border-slate-900 focus:outline-none" />
                <button type="submit" disabled={!contact.trim()} className="rounded-xl border border-slate-900 px-3.5 py-2 text-[13.5px] font-semibold disabled:opacity-40">
                  Call me
                </button>
              </form>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="flex gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input value={hp} onChange={(e) => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          disabled={limited}
          placeholder={ask === "city" ? "Type a city" : ask === "role" ? "Type a role" : "Type your message"}
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-[14px] focus:border-slate-900 focus:outline-none"
        />
        <button type="submit" disabled={busy || !text.trim() || limited} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
