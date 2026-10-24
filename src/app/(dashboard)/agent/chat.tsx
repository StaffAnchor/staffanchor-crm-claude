"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Md from "./md";
import ProposalCard, { type Proposal } from "./proposal-card";

type Shown = { id: number | string; kind: "user" | "assistant" | "proposal"; text?: string; proposalId?: string };
export type Thread = { id: string; title: string; updated_at: string; pending: number };

const IDEAS = [
  "What needs my attention today?",
  "Which open mandates have no one shortlisted?",
  "Who is waiting for a reply on WhatsApp?",
  "Find B2B SaaS account executives in Bangalore with 4 to 7 years, hunters not farmers",
  "Who should I message about our open roles, and what should I say?",
  "How many candidates did we add this week?",
];

const CAN = [
  "Answer questions about candidates, mandates, clients and the pipeline",
  "Find and rank candidates for any ask or mandate",
  "Work out who can be messaged, and draft WhatsApp messages and emails",
  "Prepare new clients, draft mandates, notes and pipeline additions",
];

export default function Chat({ firstName, initialThreads }: { firstName: string; initialThreads: Thread[] }) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Shown[]>([]);
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/agent/threads");
    if (res.ok) setThreads(((await res.json()) as { threads: Thread[] }).threads);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/agent/threads/${id}`);
    if (!res.ok) return;
    const j = (await res.json()) as { messages: Shown[]; proposals: Proposal[] };
    setMessages(j.messages);
    setProposals(Object.fromEntries(j.proposals.map((p) => [p.id, p])));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  async function open(id: string) {
    setThreadId(id);
    setError(null);
    setMenu(false);
    await loadThread(id);
  }

  function fresh() {
    setThreadId(null);
    setMessages([]);
    setProposals({});
    setError(null);
    setMenu(false);
    box.current?.focus();
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    setStatus("Thinking");
    setMessages((m) => [...m, { id: `u${Date.now()}`, kind: "user", text: message }]);
    let id = threadId;
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId, message }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "The assistant could not be reached.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { t: string; text?: string; id?: string; threadId?: string };
          if (e.t === "status") setStatus(e.text ?? null);
          if (e.t === "proposal") setStatus("Preparing a proposal for you");
          if (e.t === "error") setError(e.text ?? "Something went wrong.");
          if (e.t === "done" && e.threadId) id = e.threadId;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setStatus(null);
    setBusy(false);
    if (id) {
      setThreadId(id);
      await loadThread(id);
      void loadThreads();
    }
  }

  async function archive(id: string) {
    await fetch(`/api/agent/threads/${id}`, { method: "DELETE" });
    if (id === threadId) fresh();
    void loadThreads();
  }

  const empty = messages.length === 0 && !busy;

  return (
    <div className="mx-auto flex max-w-[1180px] gap-5 px-4 py-5">
      <aside className={`${menu ? "fixed inset-0 z-40 block bg-white p-4 dark:bg-slate-950" : "hidden"} w-full shrink-0 lg:static lg:block lg:w-[250px] lg:bg-transparent lg:p-0`}>
        <div className="mb-3 flex items-center justify-between">
          <button onClick={fresh} className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700">New chat</button>
          <button onClick={() => setMenu(false)} className="text-[13px] text-slate-500 lg:hidden">Close</button>
        </div>
        <ul className="space-y-0.5">
          {threads.length === 0 && <li className="px-1 text-[12.5px] text-slate-400">Your conversations will appear here.</li>}
          {threads.map((t) => (
            <li key={t.id} className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 ${t.id === threadId ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}>
              <button onClick={() => open(t.id)} className="min-w-0 flex-1 truncate text-left text-[13px] text-slate-700 dark:text-slate-200">{t.title}</button>
              {t.pending > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800" title="Waiting for your approval">{t.pending}</span>}
              <button onClick={() => archive(t.id)} aria-label="Remove this conversation" className="hidden shrink-0 px-1 text-slate-400 hover:text-red-600 group-hover:block">×</button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-[calc(100vh-140px)] min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between lg:hidden">
          <button onClick={() => setMenu(true)} className="text-[13px] font-medium text-teal-700">Conversations</button>
        </div>

        <div className="flex-1 space-y-3 pb-4">
          {empty ? (
            <div className="mx-auto max-w-[640px] pt-8">
              <h1 className="ros-page-title">Hi {firstName}, what can I help with?</h1>
              <p className="mt-2 text-[14px] text-slate-500">I can look anything up in the CRM and prepare actions. Nothing is sent or changed until you approve it.</p>
              <ul className="mt-4 space-y-1 text-[13.5px] text-slate-600 dark:text-slate-300">{CAN.map((c) => <li key={c} className="flex gap-2"><span className="text-teal-600">•</span>{c}</li>)}</ul>
              <p className="mt-6 text-[12px] font-semibold uppercase tracking-wide text-slate-400">Try</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {IDEAS.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-left text-[13px] text-slate-700 hover:border-teal-400 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{q}</button>)}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.kind === "user" ? (
                <div key={m.id} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-teal-600 px-4 py-2.5 text-[14px] text-white">{m.text}</p></div>
              ) : m.kind === "assistant" ? (
                <div key={m.id} className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"><Md text={m.text ?? ""} /></div>
              ) : proposals[m.proposalId ?? ""] ? (
                <div key={m.id} className="max-w-[92%]"><ProposalCard key={m.proposalId} p={proposals[m.proposalId!]} onChange={() => void loadThreads()} /></div>
              ) : null,
            )
          )}
          {busy && <p className="flex items-center gap-2 px-1 text-[13px] text-slate-500"><span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-500" />{status ?? "Working"}…</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</p>}
          <div ref={bottom} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="sticky bottom-0 bg-gradient-to-t from-[var(--ros-canvas,#f6f7f9)] via-[var(--ros-canvas,#f6f7f9)] to-transparent pb-2 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-teal-500 dark:border-slate-600 dark:bg-slate-900">
            <textarea
              ref={box}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder="Ask anything, or tell me what to prepare…"
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] outline-none"
              aria-label="Message the assistant"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-teal-600 px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40">Send</button>
          </div>
          <p className="mt-1 px-1 text-[11.5px] text-slate-400">Enter to send, Shift+Enter for a new line. It never sees phone numbers or email addresses.</p>
        </form>
      </section>
    </div>
  );
}
