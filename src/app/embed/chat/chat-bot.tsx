"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistResult } from "@/lib/site-assist/classify";
import { aOrAn, runRules, understoodSentence, type Entities, type Intent } from "@/lib/site-assist/rules";
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

const greeting = (job?: string) =>
  job
    ? `Hi, I am the StaffAnchor assistant. Looking at "${job}"? Ask me about it, or tell us what you are looking for.`
    : "Hi, I am the StaffAnchor assistant. Tell us what you are looking for, or pick one below.";

// StaffAnchor Edge: paid 1:1 coaching for sales professionals. The wording is the site's own description of it.
const EDGE = /\b(edge|mock interview|interview prep(?:aration)?|resume writing|cv writing|resume rebuild|job strategy|coaching|resume review)\b/i;
const EDGE_URL = "https://jobs.staffanchor.com/edge?src=chat";
const EDGE_REPLY = "StaffAnchor Edge is 1:1 coaching for sales and leadership professionals: interview preparation with job strategy, and resume writing, or both together. Have a look at what is included, or ask a recruiter about it.";
const CHANNEL = /\b(whatsapp channel|(?:your|the|join|join the) channel|daily jobs?|job alerts?|jobs? updates?|whatsapp group)\b/i;
const CHANNEL_URL = "https://whatsapp.com/channel/0029VbASKh5KmCPRj6oejX2u";
const CHANNEL_REPLY = "We post fresh sales roles on our WhatsApp channel, so you see new openings without chatting with anyone. It is free, and other members cannot see who you are. Join it, and apply to anything that fits.";
const EDGE_WA = "Hi StaffAnchor, I'd like to know more about StaffAnchor Edge.";

const FEES = /\b(fees?|pricing|prices?|cost|costs|charges?|commission|how much|kitna)\b/i;

async function call(payload: Record<string, unknown>) {
  const res = await fetch("/api/public/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

// WhatsApp is an alternative, never the loudest thing: an outlined chip next to the other next steps, and only a
// quiet text link while a question is waiting for its answer. The reply and the dark primary step lead.
const CHIP_WA = "inline-flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-white px-3 py-1 text-[13px] font-medium text-emerald-700 hover:bg-emerald-50";
const LINK_WA = "inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-emerald-700";

const WA_ICON = "M4 20l1.3-3.9A8 8 0 1 1 8.2 19zM9 10c0 3 2 5 5 5l1-1.5-2-1-1 .5c-.8-.4-1.4-1-1.8-1.8l.5-1-1-2z";

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={WA_ICON} />
    </svg>
  );
}

export default function ChatBot({ site, job }: { site: "main" | "jobs"; job?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: greeting(job) }]);
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
  const [unsure, setUnsure] = useState(false);
  const [waOnly, setWaOnly] = useState<string | null>(null); // a plain-answer reply that ends with just a WhatsApp chip
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
      setUnsure(true);
      say("I want to point you the right way. Which of these is closest?");
    }
  }

  // chipLabel is given when the visitor tapped the Edge chip; typed messages are already on screen.
  function showEdge(chipLabel?: string) {
    setIntent("jobseeker");
    setUnsure(false);
    setAsk(null);
    if (chipLabel) {
      me(chipLabel);
      if (!first) setFirst(chipLabel);
    }
    say(EDGE_REPLY);
    setSteps([{ label: "Explore Edge", desc: "What is included and how it works.", href: EDGE_URL, icon: "interview", primary: true }]);
    setWaOnly(EDGE_WA);
    void call({ action: "confirm", message: chipLabel ?? first ?? "edge", site, intent: "jobseeker", entities: ent });
  }

  function showChannel() {
    setIntent("jobseeker");
    setUnsure(false);
    setAsk(null);
    say(CHANNEL_REPLY);
    setSteps([
      { label: "Join the channel", desc: "New sales roles, posted as they open.", href: CHANNEL_URL, icon: "roles", primary: true },
      { label: "See open roles", desc: "Live sales roles on our site.", href: "https://jobs.staffanchor.com/jobs?src=chat", icon: "roles" },
    ]);
    setWaOnly(null);
    void call({ action: "confirm", message: "job alerts channel", site, intent: "jobseeker", entities: ent });
  }

  function choose(i: Intent, label: string) {
    if (busy) return;
    setUnsure(false);
    setSteps([]);
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
    // A new message starts a new turn: the previous answer's choices go, so the newest reply is what you see.
    setSteps([]);
    setWaOnly(null);
    setUnsure(false);
    // Questions about Edge coaching get its own reply and link, no AI needed.
    if (!ask && EDGE.test(m) && !FEES.test(m)) {
      showEdge();
      return;
    }
    // Asking for job alerts or the channel gets the channel link.
    if (!ask && CHANNEL.test(m) && !FEES.test(m)) {
      showChannel();
      return;
    }
    // Fees and prices are never guessed at; a recruiter answers them.
    if (!ask && FEES.test(m)) {
      say("Our fees depend on the role and how we work together, so a recruiter will share them directly rather than me guessing. WhatsApp is the quickest way to ask.");
      setWaOnly(`Hi StaffAnchor, ${m}`);
      return;
    }
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
    setMsgs([{ from: "bot", text: greeting(job) }]);
    setIntent(null);
    setEnt({});
    setAsk(null);
    setSteps([]);
    setFirst("");
    setContact("");
    setContactDone(false);
    setLimited(false);
    setUnsure(false);
    setWaOnly(null);
  }

  const showOptions = (!intent || unsure) && !busy;
  // The WhatsApp message carries what the visitor told us, so the recruiter starts with the full picture.
  const where = ent.city ? ` in ${ent.city}` : "";
  const waText =
    waOnly ? waOnly : intent === "employer" && ent.role
      ? `Hi StaffAnchor, I am hiring ${ent.headcount ? `${ent.headcount} ` : `${aOrAn(ent.role)} `}${ent.role}${where}.`
      : intent === "jobseeker" && ent.role
      ? `Hi StaffAnchor, I am looking for ${aOrAn(ent.role)} ${ent.role} role${where}.`
      : intent === "employer"
      ? "Hi StaffAnchor, I'd like to hire sales talent. Could someone get in touch?"
      : intent === "jobseeker"
      ? job
        ? `Hi StaffAnchor, I'm interested in the role "${job}". Could you tell me more?`
        : "Hi StaffAnchor, I'm a sales professional looking for new roles. Could you help?"
      : `Hi StaffAnchor, ${first || "I would like some help"}`;
  const waLabel = intent === "employer" ? "Chat with our hiring team on WhatsApp" : intent === "jobseeker" ? "Chat with a recruiter on WhatsApp" : "Continue on WhatsApp";
  // Tell the page the visitor chose WhatsApp, so the site's own analytics can count it.
  const waClicked = () => window.parent.postMessage({ type: "sa-chat-wa", intent: intent ?? "other" }, "*");
  const channelClicked = () => window.parent.postMessage({ type: "sa-chat-channel", intent: intent ?? "other" }, "*");

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <div className="text-[14.5px] font-semibold">StaffAnchor</div>
          <div className="text-[13px] text-slate-500">Ask us anything about jobs or hiring</div>
        </div>
        <div className="flex items-center gap-1">
          {intent && (
            <button type="button" onClick={restart} className="rounded-md px-2 py-1 text-[13px] text-slate-500 hover:bg-slate-100">
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
            <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15.5px] leading-relaxed ${m.from === "me" ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-900"}`}>{m.text}</div>
          </div>
        ))}
        {busy && <div className="text-[14px] text-slate-400">Reading…</div>}

        {/* Choices are small chips under the reply: the reply is what matters, these are shortcuts. */}
        {showOptions && (
          <div className="flex flex-wrap gap-1.5">
            {(site === "jobs" ? [OPTIONS[0], OPTIONS[4], OPTIONS[1], OPTIONS[2], OPTIONS[3]] : OPTIONS).map((o, idx) => (
              <span key={o.intent} className="contents">
                <button type="button" onClick={() => choose(o.intent, o.label)} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[13px] text-slate-700 hover:bg-slate-50">
                  {o.label}
                </button>
                {/* On the jobs site, Edge sits right beside the first choice: most visitors there are job seekers. */}
                {site === "jobs" && idx === 0 && !intent && (
                  <button type="button" onClick={() => showEdge("Explore StaffAnchor Edge")} className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-[13px] font-medium text-indigo-700 hover:bg-indigo-100">
                    Explore StaffAnchor Edge
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {intent && ask && (
          <a href={whatsappEntryLink(waText)} onClick={waClicked} target="_blank" rel="noopener noreferrer" className={LINK_WA}>
            <WaIcon /> Prefer WhatsApp? {intent === "employer" ? "Talk to our hiring team" : "Chat with a recruiter"}
          </a>
        )}

        {waOnly && steps.length === 0 && (
          <a href={whatsappEntryLink(waText)} onClick={waClicked} target="_blank" rel="noopener noreferrer" className={CHIP_WA}>
            <WaIcon /> {waLabel}
          </a>
        )}

        {steps.length > 0 && !ask && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {steps.slice(0, 3).map((st) => (
                <a
                  key={st.href}
                  href={st.href.startsWith("https://wa.me") ? whatsappEntryLink(waText) : st.href}
                  onClick={st.href.startsWith("https://wa.me") ? waClicked : st.href === CHANNEL_URL ? channelClicked : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={st.desc}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium ${st.primary ? "border-slate-900 bg-teal-600 text-white hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {st.label}
                </a>
              ))}
              <a href={whatsappEntryLink(waText)} onClick={waClicked} target="_blank" rel="noopener noreferrer" className={CHIP_WA}>
                <WaIcon /> {waLabel}
              </a>
            </div>
            {intent === "jobseeker" && !steps.some((st) => st.href === CHANNEL_URL) && (
              <a href={CHANNEL_URL} onClick={channelClicked} target="_blank" rel="noopener noreferrer" className={LINK_WA}>
                <WaIcon /> Want new sales roles daily? Join our WhatsApp channel
              </a>
            )}
            {intent === "employer" && !contactDone && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void leaveContact();
                }}
              >
                <input value={contact} onChange={(e) => setContact(e.target.value.slice(0, 80))} placeholder="Work email or mobile, and we call you" className="min-w-0 flex-1 rounded-full border border-slate-300 px-3.5 py-1.5 text-[14px] focus:border-slate-900 focus:outline-none" />
                <button type="submit" disabled={!contact.trim()} className="rounded-full border border-slate-900 px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-40">
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
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-[15px] focus:border-slate-900 focus:outline-none"
        />
        <button type="submit" disabled={busy || !text.trim() || limited} className="rounded-xl bg-slate-900 px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}
