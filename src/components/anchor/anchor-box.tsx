"use client";

import { useRef, useState } from "react";
import { ArrowUp, Briefcase, Building2, ExternalLink, Sparkles, User } from "lucide-react";
import Md from "@/app/(dashboard)/agent/md";
import ProposalCard, { type Proposal } from "@/app/(dashboard)/agent/proposal-card";

// Anchor: one box to ask or jump anywhere. Quick answers (placements, fees, "take me to...") come from the CRM's own data;
// open-ended asks go to the AI assistant for admins. Every link opens in a new tab, so the page you are on is never lost.

type PlacedRow = { linkId: string; candidateId: string; mandateId: string; candidate: string; client: string; role: string; joined: string | null; joinStatus: string | null };
type Target = { type: "mandate" | "candidate" | "client"; id: string; label: string; sub: string; href: string };
type Shown = { id: number | string; kind: "user" | "assistant" | "proposal"; text?: string; proposalId?: string };
type Result =
  | { kind: "placements"; range: number | "life"; counts: Record<string, number>; total: number; rows: PlacedRow[] }
  | { kind: "fees"; range: number | "life"; collected: number; collectedCount: number; outstanding: number; outstandingCount: number; overdueCount: number; estimatedCount: number; byClient: { client: string; outstanding: number; collected: number }[] }
  | { kind: "dropped"; total: number; rows: { linkId: string; candidateId: string; mandateId: string; candidate: string; client: string; role: string; joined: string | null; droppedOn: string | null; daysIn: number | null; reason: string; billing: { text: string; tone: "ok" | "warn" | "bad" } }[] }
  | { kind: "go"; q: string; matches: Target[] }
  | { kind: "nomatch"; q: string }
  | { kind: "denied"; text: string }
  | { kind: "agent"; messages: Shown[]; proposals: Record<string, Proposal> }
  | { kind: "error"; text: string };
type Item = { id: number; q: string; result: Result | null };

const RANGE_TEXT: Record<string, string> = { "30": "the last 30 days", "60": "the last 60 days", "90": "the last 90 days", life: "all time" };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "No date");
const ICON = { mandate: Briefcase, client: Building2, candidate: User } as const;
const TYPE_LABEL = { mandate: "Role", client: "Client", candidate: "Candidate" } as const;

const A = ({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
    {children}
  </a>
);

export default function AnchorBox({ firstName, isAdmin, variant = "hero" }: { firstName: string; isAdmin: boolean; variant?: "hero" | "drawer" }) {
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const threadRef = useRef<string | null>(null);
  const idRef = useRef(0);
  const hero = variant === "hero";

  const chips = [
    "Placed in the last 30 days",
    "Placed in the last 90 days",
    "All-time placements",
    "Who dropped within 90 days?",
    ...(isAdmin ? ["Fees collected", "What needs my attention today?"] : []),
    "Take me to Service Manager",
  ];

  const patch = (id: number, result: Result) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, result } : x)));

  async function askAgent(id: number, q: string) {
    setStatus("Thinking");
    let threadId = threadRef.current;
    let err: string | null = null;
    try {
      const res = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId, message: q }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Anchor could not be reached.");
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
          const e = JSON.parse(line) as { t: string; text?: string; threadId?: string };
          if (e.t === "status") setStatus(e.text ?? null);
          if (e.t === "proposal") setStatus("Preparing a proposal for you");
          if (e.t === "error") err = e.text ?? "Something went wrong.";
          if (e.t === "done" && e.threadId) threadId = e.threadId;
        }
      }
    } catch (e) {
      err = e instanceof Error ? e.message : "Something went wrong.";
    }
    if (threadId) threadRef.current = threadId;
    if (err && !threadId) return patch(id, { kind: "error", text: err });
    try {
      const r = await fetch(`/api/agent/threads/${threadId}`);
      const j = (await r.json()) as { messages: Shown[]; proposals: Proposal[] };
      const lastUser = [...j.messages].map((m) => m.kind).lastIndexOf("user");
      patch(id, { kind: "agent", messages: j.messages.slice(lastUser + 1), proposals: Object.fromEntries(j.proposals.map((p) => [p.id, p])) });
    } catch {
      patch(id, { kind: "error", text: err ?? "Could not read the answer." });
    }
  }

  async function ask(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    const id = ++idRef.current;
    setItems((xs) => [{ id, q, result: null }, ...xs]);
    try {
      const res = await fetch("/api/anchor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) });
      const j = await res.json();
      if (!res.ok) patch(id, { kind: "error", text: j.error ?? "Something went wrong." });
      else if (j.kind === "agent") {
        if (j.allowed) await askAgent(id, q);
        else patch(id, { kind: "denied", text: "I can answer placements and take you to any role, candidate or client. Try “placed in the last 30 days” or “take me to Service Manager”." });
      } else patch(id, j as Result);
    } catch {
      patch(id, { kind: "error", text: "The connection dropped. Try again." });
    }
    setStatus(null);
    setBusy(false);
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(); }} className={`flex items-center gap-2 rounded-2xl border bg-white shadow-sm focus-within:border-teal-500 dark:bg-slate-900 ${hero ? "border-slate-300 p-2.5 dark:border-slate-600" : "border-slate-300 p-1.5 dark:border-slate-600"}`}>
        <Sparkles className={`shrink-0 text-teal-600 ${hero ? "ml-2 h-5 w-5" : "ml-1.5 h-4 w-4"}`} aria-hidden />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Anchor, or tell it where to go…"
          aria-label="Ask Anchor"
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400 ${hero ? "py-2 text-[16px]" : "py-1.5 text-[15px]"}`}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Ask" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40">
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button key={c} type="button" disabled={busy} onClick={() => void ask(c)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[13px] text-slate-700 hover:border-teal-400 hover:text-teal-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {c}
          </button>
        ))}
      </div>

      {busy && (
        <p className="mt-4 flex items-center gap-2 text-[14px] text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-500" />
          {status ?? "Looking"}…
        </p>
      )}

      <div className="mt-4 space-y-5">
        {items.map((it) => (
          <div key={it.id}>
            <p className="mb-1.5 text-[13px] text-slate-400">
              {firstName}: <span className="text-slate-600 dark:text-slate-300">{it.q}</span>
            </p>
            {it.result && <ResultView r={it.result} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";

function ResultView({ r }: { r: Result }) {
  if (r.kind === "error" || r.kind === "denied") return <p className={`rounded-lg px-3 py-2 text-[14px] ${r.kind === "error" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200" : "bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300"}`}>{r.text}</p>;
  if (r.kind === "nomatch") return <p className="rounded-lg bg-slate-50 px-3 py-2 text-[14px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">I could not find anything called “{r.q}”. Check the spelling, or try just part of the name.</p>;

  if (r.kind === "go")
    return (
      <div className={card}>
        <ul>
          {r.matches.map((m, i) => {
            const Icon = ICON[m.type];
            return (
              <li key={m.type + m.id} className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
                <A href={m.href} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">{m.label}</span>
                    <span className="block truncate text-[13px] text-slate-500">{TYPE_LABEL[m.type]} · {m.sub}</span>
                  </span>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-[13px] font-medium ${i === 0 ? "rounded-lg bg-teal-600 px-2.5 py-1 text-white" : "text-teal-700 dark:text-teal-300"}`}>Open <ExternalLink className="h-3 w-3" /></span>
                </A>
              </li>
            );
          })}
        </ul>
      </div>
    );

  if (r.kind === "placements")
    return (
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 pt-3">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            {r.total} {r.total === 1 ? "person" : "people"} placed, {RANGE_TEXT[String(r.range)]}
          </p>
          <A href={`/home/placements?range=${r.range}`} className="text-[13px] font-medium text-teal-700 dark:text-teal-300">Open full list ↗</A>
        </div>
        <p className="px-3.5 pb-2 text-[13px] text-slate-500">30 days: {r.counts["30"]} · 60 days: {r.counts["60"]} · 90 days: {r.counts["90"]} · all time: {r.counts.life}</p>
        {r.rows.length === 0 ? (
          <p className="border-t border-slate-100 px-3.5 py-4 text-[14px] text-slate-500 dark:border-slate-800">Nobody joined in this period.</p>
        ) : (
          <ul>
            {r.rows.map((p) => (
              <li key={p.linkId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
                <div className="min-w-0">
                  <A href={`/candidates/${p.candidateId}`} className="block truncate text-[15px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{p.candidate}</A>
                  <A href={`/mandates/${p.mandateId}`} className="block truncate text-[13px] text-slate-500 hover:text-teal-700">{p.client} · {p.role}</A>
                </div>
                <div className="text-right text-[13px] text-slate-600 dark:text-slate-300">
                  <p className="font-medium">{day(p.joined)}</p>
                  <p className="text-slate-400">joined</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  if (r.kind === "dropped")
    return (
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 pt-3">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{r.total} dropped within 90 days</p>
          <A href="/home/placements" className="text-[13px] font-medium text-teal-700 dark:text-teal-300">Open the list ↗</A>
        </div>
        {r.rows.length === 0 ? (
          <p className="px-3.5 py-4 text-[14px] text-slate-500">Nobody has dropped. Good.</p>
        ) : (
          <ul className="mt-2">
            {r.rows.map((p) => (
              <li key={p.linkId} className="border-t border-slate-100 px-3.5 py-2.5 dark:border-slate-800">
                <A href={`/candidates/${p.candidateId}`} className="block truncate text-[15px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{p.candidate}</A>
                <A href={`/mandates/${p.mandateId}`} className="block truncate text-[13px] text-slate-500 hover:text-teal-700">{p.client} · {p.role} · left {day(p.droppedOn)}{p.daysIn !== null && p.daysIn >= 0 ? ` (day ${p.daysIn})` : ""}</A>
                <p className={`text-[13px] font-medium ${p.billing.tone === "bad" ? "text-rose-700" : p.billing.tone === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{p.billing.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  if (r.kind === "fees")
    return (
      <div className={card}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 pt-3">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Fees, {RANGE_TEXT[String(r.range)]}</p>
          <A href={`/home/fees?range=${r.range}`} className="text-[13px] font-medium text-teal-700 dark:text-teal-300">Open full view ↗</A>
        </div>
        <div className="grid grid-cols-2 gap-3 px-3.5 py-3">
          <div className="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
            <p className="text-[13px] text-emerald-800 dark:text-emerald-300">Collected</p>
            <p className="text-[22px] font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">{inr(r.collected)}</p>
            <p className="text-[12px] text-emerald-700">{r.collectedCount} payment{r.collectedCount === 1 ? "" : "s"}</p>
          </div>
          <div className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
            <p className="text-[13px] text-amber-800 dark:text-amber-300">Still to collect</p>
            <p className="text-[22px] font-semibold tabular-nums text-amber-900 dark:text-amber-100">{inr(r.outstanding)}</p>
            <p className="text-[12px] text-amber-700">{r.outstandingCount} invoice{r.outstandingCount === 1 ? "" : "s"}{r.overdueCount ? `, ${r.overdueCount} overdue` : ""}</p>
          </div>
        </div>
        <p className="px-3.5 pb-2 text-[12px] text-slate-400">Amounts are before GST.{r.estimatedCount ? ` ${r.estimatedCount} fee${r.estimatedCount === 1 ? " is" : "s are"} an estimate: not invoiced yet, so counted from the fee in lakhs.` : ""}</p>
        {r.byClient.length > 0 && (
          <ul>
            {r.byClient.map((c) => (
              <li key={c.client} className="flex items-center justify-between gap-3 border-t border-slate-100 px-3.5 py-2 text-[14px] dark:border-slate-800">
                <span className="truncate text-slate-800 dark:text-slate-100">{c.client}</span>
                <span className="shrink-0 text-[13px] tabular-nums text-slate-500">{c.collected ? `${inr(c.collected)} collected` : ""}{c.collected && c.outstanding ? " · " : ""}{c.outstanding ? `${inr(c.outstanding)} due` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );

  // The AI assistant's answer, with any proposals it prepared for approval.
  return (
    <div className="space-y-2">
      {r.messages.map((m) =>
        m.kind === "assistant" ? (
          <div key={m.id} className="max-w-full rounded-2xl rounded-tl-md bg-white px-4 py-2.5 text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"><Md text={m.text ?? ""} /></div>
        ) : m.kind === "proposal" && r.proposals[m.proposalId ?? ""] ? (
          <ProposalCard key={m.id} p={r.proposals[m.proposalId!]} />
        ) : null,
      )}
    </div>
  );
}
