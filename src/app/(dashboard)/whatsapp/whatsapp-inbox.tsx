"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Archive, ArchiveRestore, Bot, Check, CheckCheck, Clock, MessageCircle, Paperclip, Send, UserPlus } from "lucide-react";
import { WINDOW_MS, type WaConversation } from "@/lib/whatsapp-threads";

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
type Tab = "jobseeker" | "employer" | "other" | "unsorted" | "archived";

const TABS: { key: Tab; label: string }[] = [
  { key: "jobseeker", label: "Jobseekers" },
  { key: "employer", label: "Employers" },
  { key: "other", label: "Referrers & other" },
  { key: "unsorted", label: "Unsorted" },
  { key: "archived", label: "Archived" },
];
const KIND_LABEL: Record<Kind, string> = { unsorted: "Unsorted", jobseeker: "Jobseeker", employer: "Employer", referrer: "Referrer", other: "Other" };
const tabOf = (info: ContactInfo | undefined): Tab => {
  if (info?.archived) return "archived";
  const k = info?.kind ?? "unsorted";
  return k === "referrer" || k === "other" ? "other" : k;
};

type Filter = "needs" | "all";

const QUICK_REPLIES = [
  "Thanks for reaching out to StaffAnchor! Could you share your current CTC, expected CTC and notice period?",
  "Could you send your latest CV here (PDF or Word)? We'll look at suitable roles.",
  "Happy to help. Which city are you open to working in, and are you open to relocating?",
  "Thank you! A recruiter will review this and get back to you shortly.",
];

const clock = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export default function WhatsAppInbox({ conversations, names, contacts }: { conversations: WaConversation[]; names: Record<string, string>; contacts: Record<string, ContactInfo> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("jobseeker");
  const [filter, setFilter] = useState<Filter>("needs");
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // New messages arrive while the page is open: refresh quietly every 30 seconds.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);

  const nameOf = (c: WaConversation) => (c.candidateId && names[c.candidateId]) || contacts[c.key]?.displayName || `+${c.phone.replace(/\D/g, "")}`;
  const inTab = useMemo(() => {
    const m: Record<Tab, WaConversation[]> = { jobseeker: [], employer: [], other: [], unsorted: [], archived: [] };
    for (const c of conversations) m[tabOf(contacts[c.key])].push(c);
    return m;
  }, [conversations, contacts]);
  const tabCounts = (t: Tab) => inTab[t].filter((c) => c.needsReply || contacts[c.key]?.needsHuman).length;
  const pool = inTab[tab];
  const shown = pool.filter((c) => (filter === "needs" && tab !== "archived" ? c.needsReply || contacts[c.key]?.needsHuman : true));
  const active = shown.find((c) => c.key === selected) ?? shown[0] ?? null;
  const info = active ? contacts[active.key] : undefined;

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

  const chips: { key: Filter; label: string }[] = [
    { key: "needs", label: "Needs attention" },
    { key: "all", label: "All" },
  ];

  const windowLeft = active?.lastInboundAt ? WINDOW_MS - (now - new Date(active.lastInboundAt).getTime()) : 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => {
          const n = tabCounts(t.key);
          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelected(null);
              }}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"}`}
            >
              {t.label} <span className="text-slate-400">{inTab[t.key].length}</span>
              {n > 0 && t.key !== "archived" && <span className="ml-1 rounded-full bg-emerald-500 px-1.5 py-px text-[10.5px] font-semibold text-white">{n}</span>}
            </button>
          );
        })}
      </div>
      {tab !== "archived" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                filter === c.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900">
          <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-[14px] font-medium text-slate-700 dark:text-slate-200">No WhatsApp conversations yet</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-slate-400">When someone taps &ldquo;Message us on WhatsApp&rdquo; on the jobs site, the website or an email, their message appears here.</p>
        </div>
      ) : (
        <div className="grid min-h-[560px] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {shown.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-slate-400">Nothing in this view.</p>}
            {shown.map((c) => {
              const last = c.messages[c.messages.length - 1];
              const isActive = active?.key === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    setSelected(c.key);
                    setError(null);
                  }}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 dark:border-slate-800 ${isActive ? "bg-slate-50 dark:bg-slate-800/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {c.needsReply && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Needs reply" />}
                      <span className={`truncate text-[13.5px] ${c.needsReply ? "font-semibold" : "font-medium"} text-slate-900 dark:text-slate-100`}>{nameOf(c)}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400" suppressHydrationWarning>
                      {ago(c.lastAt, now)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                    {last.direction === "outbound" ? "You: " : ""}
                    {last.body_preview || (last.template_name ? `Template: ${last.template_name}` : "Message")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!c.candidateId && <span className="inline-block rounded bg-amber-50 px-1.5 py-px text-[10.5px] font-medium text-amber-700">Not in database</span>}
                    {contacts[c.key]?.needsHuman && <span className="inline-block rounded bg-rose-50 px-1.5 py-px text-[10.5px] font-medium text-rose-700">Needs a person</span>}
                    {contacts[c.key]?.botStatus === "active" && !contacts[c.key]?.botPaused && <span className="inline-block rounded bg-sky-50 px-1.5 py-px text-[10.5px] font-medium text-sky-700">Collecting profile</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {active ? (
            <div className="flex max-h-[70vh] flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{nameOf(active)}</div>
                  <div className="text-[12px] text-slate-400">+{active.phone.replace(/\D/g, "")}</div>
                </div>
                <div className="flex items-center gap-3 text-[12px]">
                  {active.candidateId ? (
                    <Link href={`/candidates/${active.candidateId}`} className="font-medium text-blue-600 hover:underline">
                      Open candidate
                    </Link>
                  ) : (
                    <Link href="/candidates/new" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                      <UserPlus className="h-3.5 w-3.5" /> Add as candidate
                    </Link>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${windowLeft > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} suppressHydrationWarning>
                    <Clock className="h-3 w-3" />
                    {windowLeft > 0 ? `Reply window open · ${Math.max(1, Math.floor(windowLeft / 3_600_000))}h left` : "Reply window closed"}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-[12px] dark:border-slate-800">
                <label className="inline-flex items-center gap-1 text-slate-500">
                  Type
                  <select value={info?.kind ?? "unsorted"} onChange={(e) => control("set_kind", e.target.value)} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[12px] dark:border-slate-700 dark:bg-slate-900">
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Bot className="h-3.5 w-3.5" />
                  {info?.optedOut ? "Opted out of automatic messages" : info?.botPaused ? "Assistant paused" : info?.botStatus === "active" ? `Assistant collecting profile${info.botStep ? ` (${info.botStep})` : ""}` : "Assistant idle"}
                </span>
                {info && !info.optedOut && (
                  <button onClick={() => control(info.botPaused ? "resume_bot" : "pause_bot")} className="font-medium text-blue-600 hover:underline">
                    {info.botPaused ? "Resume assistant" : "Pause assistant"}
                  </button>
                )}
                {info?.needsHuman && (
                  <button onClick={() => control("mark_handled")} className="font-medium text-blue-600 hover:underline">
                    Mark handled
                  </button>
                )}
                <span className="ml-auto flex items-center gap-3">
                  {info?.archived ? (
                    <button onClick={() => control("unarchive")} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                      <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                    </button>
                  ) : (
                    <>
                      <button onClick={() => control("archive")} className="inline-flex items-center gap-1 font-medium text-slate-600 hover:underline dark:text-slate-300">
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                      <button onClick={() => control("archive_mute")} title="Archive, and stay archived even if they message again" className="font-medium text-slate-600 hover:underline dark:text-slate-300">
                        Archive &amp; mute
                      </button>
                    </>
                  )}
                </span>
              </div>
              {info?.needsHuman && info.reason && <p className="border-b border-rose-100 bg-rose-50 px-4 py-1.5 text-[12px] text-rose-700">{info.reason}</p>}

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50/60 px-4 py-4 dark:bg-slate-950/30">
                {active.messages.map((m) => {
                  const mine = m.direction === "outbound";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${mine ? "bg-emerald-600 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"}`}>
                        {mine && m.template_name?.startsWith("bot:") && <p className="mb-0.5 text-[10.5px] font-medium uppercase tracking-wide text-emerald-100">Assistant</p>}
                        {m.media_path && (
                          <a href={`/api/whatsapp/media?id=${m.id}`} target="_blank" rel="noreferrer" className={`mb-1 inline-flex items-center gap-1 text-[12px] font-medium underline ${mine ? "text-white" : "text-blue-600"}`}>
                            <Paperclip className="h-3 w-3" /> Open {m.media_name || "file"}
                          </a>
                        )}
                        <p className="whitespace-pre-wrap">{m.body_preview || (m.template_name ? `Template: ${m.template_name}` : "Message")}</p>
                        <div className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${mine ? "text-emerald-100" : "text-slate-400"}`} suppressHydrationWarning>
                          {clock(m.created_at)}
                          {mine && (m.status === "read" ? <CheckCheck className="h-3 w-3" /> : m.status === "delivered" || m.status === "sent" ? <Check className="h-3 w-3" /> : null)}
                        </div>
                        {m.status === "failed" && (
                          <p className="mt-1 flex items-start gap-1 text-[11px] text-rose-100">
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
                        <button key={q} onClick={() => setDraft(q)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11.5px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
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
                  <p className="text-[12.5px] text-slate-500">
                    The 24-hour reply window has closed. WhatsApp allows a free message only within 24 hours of their last message. They can message again, or use an approved template.
                  </p>
                )}
                {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-[13px] text-slate-400 dark:border-slate-700">Select a conversation.</div>
          )}
        </div>
      )}
    </div>
  );
}
