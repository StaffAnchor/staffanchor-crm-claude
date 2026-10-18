"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, ArchiveRestore, Bot, Check, CheckCheck, Clock, MessageCircle, MoreHorizontal, Paperclip, Send, UserPlus } from "lucide-react";
import { thankYouMessage } from "@/lib/missing-message";
import AskMissingDetails from "../candidates/[id]/ask-missing-details";
import { WINDOW_MS, formatPhone, type WaConversation } from "@/lib/whatsapp-threads";
import { STATE_META, ago, statusOf, type WaState, type WaStatus } from "@/lib/whatsapp-status";
import WhatsAppReview from "@/components/whatsapp-review";
import { TemplateSetup } from "@/components/channel-toggle";
import { useWhatsAppTemplates } from "@/lib/use-whatsapp-templates";

type Kind = "unsorted" | "jobseeker" | "employer" | "referrer" | "other";
export type ContactInfo = {
  kind: Kind;
  archived: boolean;
  muted: boolean;
  botPaused: boolean;
  needsHuman: boolean;
  reason: string | null;
  optedOut: boolean;
  botStatus: string | null;
  botStep: string | null;
  displayName: string | null;
};
type View = WaState | "all";
type Who = "all" | "jobseeker" | "employer" | "other";

const KIND_LABEL: Record<Kind, string> = { unsorted: "Unsorted", jobseeker: "Jobseeker", employer: "Employer", referrer: "Referrer", other: "Other" };
const whoOf = (info: ContactInfo | undefined): Who => {
  const k = info?.kind ?? "unsorted";
  return k === "jobseeker" ? "jobseeker" : k === "employer" ? "employer" : "other";
};

const QUICK_REPLIES = [
  "Thanks for reaching out to StaffAnchor! Could you share your current CTC, expected CTC and notice period?",
  "Could you send your latest CV here (PDF or Word)? We'll look at suitable roles.",
  "Happy to help. Which city are you open to working in, and are you open to relocating?",
  "Thank you! A recruiter will review this and get back to you shortly.",
];

const clock = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const TONE: Record<string, { tile: string; dot: string; banner: string }> = {
  rose: { tile: "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/20", dot: "bg-rose-500", banner: "border-rose-100 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-200" },
  teal: { tile: "border-teal-200 bg-teal-50/70 dark:border-teal-900 dark:bg-teal-950/20", dot: "bg-teal-500", banner: "border-teal-100 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/20 dark:text-teal-200" },
  slate: { tile: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", dot: "bg-slate-400", banner: "border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" },
  amber: { tile: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20", dot: "bg-amber-500", banner: "border-amber-100 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200" },
};

const TILES: WaState[] = ["needs_you", "assistant", "waiting", "failed"];

export default function WhatsAppInbox({
  conversations,
  names,
  contacts,
  missing,
  drafts,
  suggestions = {},
}: {
  conversations: WaConversation[];
  names: Record<string, string>;
  contacts: Record<string, ContactInfo>;
  missing: Record<string, string[]>;
  drafts: Record<string, string>;
  suggestions?: Record<string, { candidateId: string; name: string; phone: string | null }>;
}) {
  const router = useRouter();
  // Opens on what needs you; if nothing does, on the chats waiting for a reply, so what you sent is never hidden.
  const [view, setView] = useState<View>(() => {
    const t = Date.now();
    return conversations.some((c) => statusOf(c, contacts[c.key], t).state === "needs_you") ? "needs_you" : "waiting";
  });
  const templateFlags = useWhatsAppTemplates();
  const [followUp, setFollowUp] = useState(false);
  const [who, setWho] = useState<Who>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [emailedOk, setEmailedOk] = useState(false);
  type Found = { key: string; label: string; display: string; raw: string };
  const [reading, setReading] = useState<{ messageId: string; busy: boolean; found: Found[] | null; saved: string[] | null } | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string | null; isNew: boolean; alt: boolean } | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // New messages arrive while the page is open: refresh quietly every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);

  const nameOf = (c: WaConversation) => (c.candidateId && names[c.candidateId]) || contacts[c.key]?.displayName || formatPhone(c.phone);

  // Every conversation gets one state. The page is organised by that: what needs me, what is the assistant doing, who
  // are we waiting on. "Who they are" (jobseeker, employer) is a small filter, not the main structure.
  const statuses = useMemo(() => {
    const m = new Map<string, WaStatus>();
    for (const c of conversations) m.set(c.key, statusOf(c, contacts[c.key], now));
    return m;
  }, [conversations, contacts, now]);
  const counts = useMemo(() => {
    const n: Record<WaState, number> = { needs_you: 0, assistant: 0, waiting: 0, failed: 0, archived: 0 };
    for (const c of conversations) {
      if (who !== "all" && whoOf(contacts[c.key]) !== who) continue;
      n[statuses.get(c.key)!.state]++;
    }
    return n;
  }, [conversations, contacts, statuses, who]);
  const shown = useMemo(() => {
    const list = conversations.filter((c) => {
      const st = statuses.get(c.key)!;
      if (who !== "all" && whoOf(contacts[c.key]) !== who) return false;
      if (view === "all") return st.state !== "archived";
      return st.state === view;
    });
    // Waiting for you: longest wait first, so nothing ages out of sight. Everything else: newest first.
    return view === "needs_you" ? list.sort((a, b) => statuses.get(b.key)!.waitingMs - statuses.get(a.key)!.waitingMs) : list;
  }, [conversations, contacts, statuses, view, who]);
  const active = shown.find((c) => c.key === selected) ?? shown[0] ?? null;
  const info = active ? contacts[active.key] : undefined;
  const status = active ? statuses.get(active.key) ?? null : null;
  const whoCounts = useMemo(() => {
    const n: Record<Who, number> = { all: conversations.length, jobseeker: 0, employer: 0, other: 0 };
    for (const c of conversations) n[whoOf(contacts[c.key])]++;
    return n;
  }, [conversations, contacts]);

  // Turn a CV someone sent into a profile: the number is from the chat, the rest is read from the CV.
  async function createProfile(messageId: string) {
    setCreating(messageId);
    setError(null);
    setCreated(null);
    try {
      let email: string | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch("/api/whatsapp/create-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, email }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.needsEmail) {
          const typed = window.prompt(`${data.error}${data.name ? `\n\nName on the CV: ${data.name}` : ""}`);
          if (!typed || !typed.includes("@")) return;
          email = typed.trim();
          continue;
        }
        if (!res.ok || !data.ok) setError(data.error ?? "Couldn't create the profile.");
        else {
          setCreated({ id: data.candidateId, name: data.name ?? null, isNew: !!data.created, alt: !!data.addedAlternate });
          router.refresh();
        }
        return;
      }
    } finally {
      setCreating(null);
    }
  }

  // Read a free-text reply into the profile: first a preview, and only a click on Apply saves anything.
  async function readReply(messageId: string) {
    if (!active?.candidateId) return;
    setError(null);
    setReading({ messageId, busy: true, found: null, saved: null });
    const res = await fetch("/api/whatsapp/read-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: active.candidateId, messageId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Couldn't read that reply.");
      setReading(null);
    } else setReading({ messageId, busy: false, found: data.found as Found[], saved: null });
  }

  async function applyReply() {
    if (!active?.candidateId || !reading?.found) return;
    setReading({ ...reading, busy: true });
    const apply: Record<string, string> = {};
    for (const f of reading.found) apply[f.key] = f.raw;
    const res = await fetch("/api/whatsapp/read-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: active.candidateId, apply }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Couldn't save.");
      setReading(null);
    } else {
      setReading({ messageId: reading.messageId, busy: false, found: null, saved: data.saved as string[] });
      router.refresh();
    }
  }

  async function emailDraft() {
    if (!active?.candidateId || !draft.trim()) return;
    setEmailing(true);
    setError(null);
    setEmailedOk(false);
    try {
      const res = await fetch("/api/whatsapp/email-candidate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId: active.candidateId, body: draft }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setError(data.error ?? "Couldn't send the email.");
      else {
        setEmailedOk(true);
        setDraft("");
      }
    } finally {
      setEmailing(false);
    }
  }

  async function control(action: string, kind?: string) {
    if (!active) return;
    setError(null);
    const res = await fetch("/api/whatsapp/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: active.phone, action, kind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "That didn't work.");
    else router.refresh();
  }

  async function send() {
    if (!active || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/reply-to-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: active.phone, candidateId: active.candidateId, body: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't send that message.");
      } else {
        setDraft("");
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }


  const windowLeft = active?.lastInboundAt ? WINDOW_MS - (now - new Date(active.lastInboundAt).getTime()) : 0;

  return (
    <div>
      {/* What is going on, at a glance. Each tile is a view of the list below. */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TILES.map((st) => {
          const meta = STATE_META[st];
          const tone = TONE[meta.tone];
          const on = view === st;
          return (
            <button
              key={st}
              type="button"
              title={meta.blurb}
              onClick={() => {
                setView(st);
                setSelected(null);
              }}
              className={`rounded-xl border px-4 py-3 text-left transition ${tone.tile} ${on ? "ring-2 ring-slate-900/70 dark:ring-slate-100/70" : "hover:shadow-sm"}`}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                <span className={`h-2 w-2 rounded-full ${tone.dot}`} /> {meta.label}
              </span>
              <span className="mt-1 block text-[26px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{counts[st]}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate-500">{view === "all" ? "Every open conversation, newest first." : STATE_META[view].blurb}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          {(["all", "jobseeker", "employer", "other"] as Who[]).map((w) => (
            <button key={w} type="button" onClick={() => { setWho(w); setSelected(null); }} className={`rounded-full border px-2.5 py-1 font-medium ${who === w ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"}`}>
              {w === "all" ? "Everyone" : w === "jobseeker" ? "Jobseekers" : w === "employer" ? "Employers" : "Other"} <span className="opacity-60">{whoCounts[w]}</span>
            </button>
          ))}
          <button type="button" onClick={() => { setView(view === "all" ? "needs_you" : "all"); setSelected(null); }} className="ml-1 rounded-full px-2.5 py-1 font-medium text-teal-700 hover:underline dark:text-teal-300">
            {view === "all" ? "Back to what needs you" : "Show all"}
          </button>
          <button type="button" onClick={() => { setView("archived"); setSelected(null); }} className={`rounded-full px-2.5 py-1 font-medium ${view === "archived" ? "text-slate-900 underline dark:text-slate-100" : "text-slate-500 hover:underline"}`}>
            Archived {counts.archived}
          </button>
        </span>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-[14px] font-medium text-slate-700 dark:text-slate-200">No WhatsApp conversations yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-slate-400">When someone taps &ldquo;Message us on WhatsApp&rdquo; on the jobs site, the website or an email, their message appears here.</p>
        </div>
      ) : (
        <div className="grid min-h-[560px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {shown.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Check className="mx-auto h-6 w-6 text-emerald-500" />
                <p className="mt-2 text-[13px] font-medium text-slate-700 dark:text-slate-200">{view === "needs_you" ? "You're all caught up" : "Nothing here"}</p>
                <p className="mt-0.5 text-[12px] text-slate-400">{view === "needs_you" ? "No one is waiting on a person right now." : "Try another view above."}</p>
              </div>
            )}
            {shown.map((c) => {
              const st = statuses.get(c.key)!;
              const isActive = active?.key === c.key;
              const initials = nameOf(c).split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "#";
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    setSelected(c.key);
                    setError(null);
                  }}
                  className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 dark:border-slate-800 ${isActive ? "bg-slate-50 dark:bg-slate-800/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"}`}
                >
                  <span className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {initials}
                    {st.state === "needs_you" && <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${st.urgency === "late" ? "bg-rose-500" : st.urgency === "soon" ? "bg-amber-500" : "bg-emerald-500"}`} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-[13.5px] ${st.state === "needs_you" ? "font-semibold" : "font-medium"} text-slate-900 dark:text-slate-100`}>{nameOf(c)}</span>
                      <span className="shrink-0 text-xs text-slate-400" suppressHydrationWarning>{ago(Math.max(0, now - new Date(c.lastAt).getTime()))}</span>
                    </span>
                    <span className={`mt-0.5 block truncate text-[12px] ${st.state === "needs_you" ? "text-slate-700 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}`}>{st.why}</span>
                    {st.state !== "needs_you" && (() => {
                      const last = c.messages[c.messages.length - 1];
                      const text = (last.body_preview ?? "").replace(/\s+/g, " ").trim();
                      return text ? <span className="mt-0.5 block truncate text-xs text-slate-400">{last.direction === "outbound" ? "You: " : ""}{text}</span> : null;
                    })()}
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {!c.candidateId && <span className="rounded bg-amber-50 px-1.5 py-px text-xs font-medium text-amber-700">Not in database</span>}
                      {st.state === "needs_you" && st.windowHoursLeft === null && <span className="rounded bg-slate-100 px-1.5 py-px text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Needs a template to reply</span>}
                      {st.state === "needs_you" && st.windowHoursLeft !== null && st.windowHoursLeft <= 6 && <span className="rounded bg-amber-50 px-1.5 py-px text-xs font-medium text-amber-700">Free reply closes in {st.windowHoursLeft}h</span>}
                      {st.state === "needs_you" && st.urgency === "late" && <span className="rounded bg-rose-50 px-1.5 py-px text-xs font-medium text-rose-700">Waiting {ago(st.waitingMs)}</span>}
                      {view === "all" && st.state !== "needs_you" && <span className="rounded bg-slate-100 px-1.5 py-px text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{STATE_META[st.state].label}</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {active && status ? (
            <div className="flex max-h-[70vh] flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{nameOf(active)}</div>
                  <div className="text-[12px] text-slate-400">{formatPhone(active.phone)} · {KIND_LABEL[info?.kind ?? "unsorted"]}</div>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  {active.candidateId ? (
                    <Link href={`/candidates/${active.candidateId}`} className="font-medium text-teal-600 hover:underline">
                      Open candidate
                    </Link>
                  ) : (
                    <Link href="/candidates/new" className="inline-flex items-center gap-1 font-medium text-teal-600 hover:underline">
                      <UserPlus className="h-3.5 w-3.5" /> Add as candidate
                    </Link>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${windowLeft > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} suppressHydrationWarning>
                    <Clock className="h-3 w-3" />
                    {windowLeft > 0 ? `Free reply open · ${Math.max(1, Math.floor(windowLeft / 3_600_000))}h left` : "Free reply closed"}
                  </span>
                  <details className="relative">
                    <summary className="flex cursor-pointer list-none items-center rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Manage this chat">
                      <MoreHorizontal className="h-4 w-4" />
                    </summary>
                    <div className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-[12px] shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <label className="flex items-center justify-between gap-2 text-slate-500">
                        Type
                        <select value={info?.kind ?? "unsorted"} onChange={(e) => control("set_kind", e.target.value)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] dark:border-slate-700 dark:bg-slate-900">
                          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                            <option key={k} value={k}>{KIND_LABEL[k]}</option>
                          ))}
                        </select>
                      </label>
                      <p className="flex items-center gap-1 text-slate-500">
                        <Bot className="h-3.5 w-3.5" />
                        {info?.optedOut ? "Opted out of automatic messages" : info?.botPaused ? "Assistant paused" : info?.botStatus === "active" ? "Assistant collecting profile" : "Assistant idle"}
                      </p>
                      {info && !info.optedOut && (
                        <button onClick={() => control(info.botPaused ? "resume_bot" : "pause_bot")} className="block font-medium text-teal-600 hover:underline">
                          {info.botPaused ? "Resume the assistant" : "Pause the assistant"}
                        </button>
                      )}
                      {info?.archived ? (
                        <button onClick={() => control("unarchive")} className="flex items-center gap-1 font-medium text-teal-600 hover:underline">
                          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                        </button>
                      ) : (
                        <>
                          <button onClick={() => control("archive")} className="flex items-center gap-1 font-medium text-slate-700 hover:underline dark:text-slate-200">
                            <Archive className="h-3.5 w-3.5" /> Archive
                          </button>
                          <button onClick={() => control("archive_mute")} title="Archive, and stay archived even if they message again" className="block font-medium text-slate-700 hover:underline dark:text-slate-200">
                            Archive and mute
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                </div>
              </div>

              {/* Why this chat is here, and the one thing to do. */}
              <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[12.5px] ${TONE[STATE_META[status.state].tone].banner}`}>
                <span className="font-semibold">{STATE_META[status.state].label}</span>
                <span className="min-w-0 flex-1">{status.why}</span>
                {info?.needsHuman && (
                  <button onClick={() => control("mark_handled")} className="rounded-full bg-white/80 px-3 py-1 font-semibold text-slate-800 ring-1 ring-black/10 hover:bg-white dark:bg-slate-800 dark:text-slate-100">
                    Mark as handled
                  </button>
                )}
                {status.state === "waiting" && <span className="text-xs opacity-80">Nothing to do yet. {windowLeft > 0 ? "You can still write to them." : "Wait for them, or follow up with a template."}</span>}
                {status.state === "assistant" && <span className="text-xs opacity-80">It will hand over if it gets stuck.</span>}
              </div>

              {!active.candidateId && suggestions[active.key] && (
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-4 py-2 text-[12.5px] dark:border-amber-900 dark:bg-amber-950/20">
                  <span className="text-amber-900 dark:text-amber-200">
                    Possible match: <strong>{suggestions[active.key].name}</strong>
                    {suggestions[active.key].phone ? ` (profile number ${formatPhone(suggestions[active.key].phone)})` : ""}. Same person, different number?
                  </span>
                  <button
                    disabled={linking}
                    onClick={async () => {
                      setLinking(true);
                      setLinkMessage(null);
                      try {
                        const res = await fetch("/api/whatsapp/link-candidate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ phone: active.phone, candidateId: suggestions[active.key].candidateId }),
                        });
                        const d = await res.json().catch(() => ({}));
                        setLinkMessage(res.ok ? `Linked to ${d.name ?? "the profile"}. This number is saved as an alternate.` : d.error ?? "Couldn't link.");
                        router.refresh();
                      } finally {
                        setLinking(false);
                      }
                    }}
                    className="rounded-full bg-amber-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
                  >
                    Link this chat and save the number
                  </button>
                  <Link href={`/candidates/${suggestions[active.key].candidateId}`} className="text-[12px] font-medium text-teal-600 hover:underline">
                    Open profile
                  </Link>
                </div>
              )}
              {linkMessage && <p className="border-b border-slate-100 bg-emerald-50 px-4 py-1.5 text-[12px] text-emerald-800">{linkMessage}</p>}

              {active.candidateId && (missing[active.candidateId]?.length ?? 0) > 0 && (
                <div className="border-b border-slate-100 px-4 pb-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-x-3">
                    <AskMissingDetails candidateId={active.candidateId} missing={missing[active.candidateId]} />
                    {drafts[active.candidateId] && (
                      <button
                        onClick={() => {
                          setDraft(drafts[active.candidateId as string]);
                          setEmailedOk(false);
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200"
                      >
                        Suggest message
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-slate-950/30">
                {active.messages.map((m) => {
                  const mine = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${mine ? "bg-emerald-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"}`}>
                        {mine && m.template_name?.startsWith("bot:") && <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-emerald-100">Assistant</p>}
                        {(m.media_path || (!mine && /^(Document|Photo)/.test(m.body_preview ?? ""))) && (
                          <a href={`/api/whatsapp/media?id=${m.id}`} target="_blank" rel="noreferrer" className={`mb-1 inline-flex items-center gap-1 text-[12px] font-medium underline ${mine ? "text-white" : "text-teal-600"}`}>
                            <Paperclip className="h-3 w-3" /> Open {m.media_name || m.body_preview?.replace(/^Document:\s*/, "").replace(/\s*\(.*\)$/, "") || "file"}
                          </a>
                        )}
                        {!mine && !active.candidateId && (m.media_path || m.body_preview?.startsWith("Document:")) && (
                          <button
                            onClick={() => createProfile(m.id)}
                            disabled={creating !== null}
                            className="mb-1 mr-2 inline-flex items-center gap-1 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                          >
                            <UserPlus className="h-3 w-3" /> {creating === m.id ? "Reading the CV…" : "Create profile from this CV"}
                          </button>
                        )}
                        {!mine && active.candidateId && (missing[active.candidateId]?.length ?? 0) > 0 && m.body_preview && !/^(Document|Photo|Voice note|Video)/.test(m.body_preview) && m.body_preview.length > 2 && (
                          <button onClick={() => readReply(m.id)} disabled={reading?.busy} className="mb-1 mr-2 inline-flex items-center gap-1 rounded-full border border-teal-200 px-2 py-0.5 text-xs font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60">
                            {reading?.busy && reading.messageId === m.id ? "Reading…" : "Fill profile from this reply"}
                          </button>
                        )}
                        <p className="whitespace-pre-wrap">{m.body_preview || (m.template_name ? `Template: ${m.template_name}` : "Message")}</p>
                        <div className={`mt-1 flex items-center justify-end gap-1 text-xs ${mine ? "text-emerald-100" : "text-slate-400"}`} suppressHydrationWarning>
                          {clock(m.created_at)}
                          {mine && (m.status === "read" ? <CheckCheck className="h-3 w-3" /> : m.status === "delivered" || m.status === "sent" ? <Check className="h-3 w-3" /> : null)}
                        </div>
                        {m.status === "failed" && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-rose-100">
                            <AlertCircle className="mt-px h-3 w-3 shrink-0" /> Not delivered{m.error ? `: ${m.error}` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                {windowLeft > 0 ? (
                  <>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {QUICK_REPLIES.map((q) => (
                        <button key={q} onClick={() => setDraft(q)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                          {q.length > 44 ? `${q.slice(0, 44)}…` : q}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        placeholder="Write a reply"
                        className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900"
                      />
                      <button
                        onClick={send}
                        disabled={sending || !draft.trim()}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    <p className="text-[12.5px] text-slate-500">
                      Their 24-hour free-reply window has closed. WhatsApp now allows only an approved template. Send a short follow-up asking them to reply, and when they do, the chat reopens and you can write freely.
                      {active.candidateId ? " Or email the candidate instead." : ""}
                    </p>
                    {templateFlags?.followUp ? (
                      <button type="button" onClick={() => setFollowUp(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500">
                        <MessageCircle className="h-4 w-4" /> Review and send a follow-up
                      </button>
                    ) : templateFlags ? (
                      <TemplateSetup which="followUp" />
                    ) : null}
                    {active.candidateId && draft && (
                      <div className="mt-2 flex items-end gap-2">
                        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
                        <button onClick={emailDraft} disabled={emailing || !draft.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-slate-800 px-4 text-[13px] font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
                          {emailing ? "Sending…" : "Send by email"}
                        </button>
                      </div>
                    )}
                    {emailedOk && <p className="mt-2 text-[12px] text-emerald-700">Email sent.</p>}
                  </div>
                )}
                {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
                {reading?.found && (
                  <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-[12.5px] dark:border-teal-900 dark:bg-teal-950/30">
                    <p className="font-medium text-slate-800 dark:text-slate-100">Found in their reply. Save these to the profile?</p>
                    <ul className="mt-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                      {reading.found.map((f) => (
                        <li key={f.key}>
                          {f.label}: <span className="font-semibold">{f.display}</span> <span className="text-slate-400">(they wrote &ldquo;{f.raw}&rdquo;)</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex gap-2">
                      <button onClick={applyReply} disabled={reading.busy} className="rounded-full bg-teal-600 px-3 py-1 font-semibold text-white hover:bg-teal-500 disabled:opacity-60">
                        {reading.busy ? "Saving…" : "Apply to profile"}
                      </button>
                      <button onClick={() => setReading(null)} className="rounded-full border border-slate-300 px-3 py-1 text-slate-600 dark:border-slate-600 dark:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {reading?.saved && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="text-emerald-700">Saved to the profile: {reading.saved.join(", ")}.</span>
                    <button
                      onClick={() => {
                        const left = (active?.candidateId ? missing[active.candidateId] ?? [] : []).filter((l) => !reading.saved?.includes(l)).length > 0;
                        setDraft(thankYouMessage(active ? names[active.candidateId ?? ""] ?? null : null, left));
                        setEmailedOk(false);
                      }}
                      className="rounded-full border border-emerald-300 px-2.5 py-1 font-semibold text-emerald-800 hover:bg-emerald-50"
                    >
                      Write thank-you
                    </button>
                    <span className="text-slate-400">Fills the reply box so you can check it before sending.</span>
                  </div>
                )}
                {created && (
                  <p className="mt-2 text-[12px] text-emerald-700">
                    {created.isNew ? "Profile created" : "CV added to the existing profile (matched by the email on the CV)"}{created.alt ? ", and this WhatsApp number was saved as an alternate number" : ""}
                    {created.name ? ` for ${created.name}` : ""}.{" "}
                    <Link href={`/candidates/${created.id}`} className="font-medium underline">
                      Open candidate
                    </Link>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-[13px] text-slate-400 dark:border-slate-700">Select a conversation.</div>
          )}
        </div>
      )}
      {followUp && active && (
        <WhatsAppReview
          title="Reopen the chat with a follow-up"
          recipient={nameOf(active)}
          loadPreview={async () => {
            const res = await fetch("/api/whatsapp/follow-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: active.phone, candidateId: active.candidateId, preview: true }) });
            const d = (await res.json().catch(() => ({}))) as { ok?: boolean; preview?: never; error?: string };
            if (!res.ok || d.ok === false || !d.preview) return { ok: false, error: d.error ?? "Couldn't prepare the message." } as const;
            return { ok: true, preview: d.preview } as const;
          }}
          send={async () => {
            const res = await fetch("/api/whatsapp/follow-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: active.phone, candidateId: active.candidateId }) });
            const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            return res.ok && d.ok !== false ? { ok: true, text: "Sent. When they reply, you can write to them freely for 24 hours." } : { ok: false, text: d.error ?? "That didn't work. Nothing was sent." };
          }}
          onDone={() => router.refresh()}
          onClose={() => setFollowUp(false)}
        />
      )}
    </div>
  );
}
