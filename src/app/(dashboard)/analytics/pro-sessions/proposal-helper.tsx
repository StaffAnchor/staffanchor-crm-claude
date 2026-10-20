"use client";

import { useState } from "react";

type Result = { ok: true; slug: string; proposal: string; fit: "good" | "partial" | "poor"; fitNote: string; ai: boolean } | { ok: false; error: string };

const SERVICES = [
  { slug: "", label: "Choose for me" },
  { slug: "mock-interview", label: "Mock interview" },
  { slug: "job-search-strategy", label: "Job search strategy + resume rebuild" },
  { slug: "resume-writing", label: "Resume writing" },
];
const FIT: Record<string, string> = {
  good: "Good fit for these sessions.",
  partial: "Partly a fit. Read the draft before sending.",
  poor: "Probably not a fit for sales-focused sessions. Review before sending.",
};

export default function ProposalHelper() {
  const [text, setText] = useState("");
  const [first, setFirst] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  async function make() {
    setBusy(true);
    setCopied(false);
    const r = await fetch("/api/admin/pro/proposal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestText: text, firstName: first, serviceSlug: slug || undefined }),
    });
    const j = (await r.json().catch(() => ({ ok: false, error: "Something went wrong." }))) as Result;
    setBusy(false);
    setRes(j);
    if (j.ok) setDraft(j.proposal);
  }
  async function copy() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
  }
  const len = draft.length;
  const lenOk = len >= 100 && len <= 1500;

  return (
    <div className="space-y-3 text-[13px]">
      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste their answers under “Project details” here (what they need help with, where they are in their career, their goals). Leave it empty for a standard proposal. Their name and contact details aren't needed."
        className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Their first name (optional)" className="w-52 rounded-md border border-slate-300 bg-transparent px-2.5 py-1.5 dark:border-slate-700" />
        <select value={slug} onChange={(e) => setSlug(e.target.value)} className="rounded-md border border-slate-300 bg-transparent px-2 py-1.5 dark:border-slate-700">
          {SERVICES.map((s) => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <button onClick={make} disabled={busy} className="rounded-md bg-teal-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-teal-700 disabled:opacity-50">
          {busy ? "Drafting…" : "Draft proposal"}
        </button>
      </div>
      {res && !res.ok && <p className="text-red-600">{res.error}</p>}
      {res && res.ok && (
        <div className="space-y-2">
          <p className={`text-[12.5px] ${res.fit === "good" ? "text-emerald-700" : "text-amber-700"}`}>
            {FIT[res.fit]} {res.fitNote}
          </p>
          <textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} className="w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" />
          <div className="flex items-center gap-3">
            <button onClick={copy} disabled={!lenOk} className="rounded-md bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
              {copied ? "Copied" : "Copy for LinkedIn"}
            </button>
            <span className={`text-xs tabular-nums ${lenOk ? "text-slate-500" : "text-red-600"}`}>{len} / 1,500 characters (LinkedIn needs at least 100)</span>
            {!res.ai && <span className="text-xs text-slate-400">Standard template</span>}
          </div>
        </div>
      )}
    </div>
  );
}
