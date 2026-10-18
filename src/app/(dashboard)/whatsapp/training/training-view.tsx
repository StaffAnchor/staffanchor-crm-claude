"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

export type QGroup = { ids: string[]; text: string; others: string[]; count: number; who: string[]; latest: string; reason: string | null; suggestion: { answer: string; question: string } | null };
export type SavedAnswer = { id: string; question: string; answer: string; active: boolean; uses: number; lastUsedAt: string | null };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function TrainingView({ groups, saved }: { groups: QGroup[]; saved: SavedAnswer[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setMsg(null);
    const res = await fetch("/api/whatsapp/training", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = (await res.json().catch(() => ({}))) as { error?: string; saved?: number; answered?: number; sent?: number };
    setBusy(null);
    if (!res.ok) return setMsg(d.error ?? "That didn't work.");
    if (body.action === "answer") setMsg(`Saved. The assistant will answer this next time.${d.sent ? ` Sent to ${d.sent} waiting now.` : ""}`);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-8">
      {msg && <p className="text-sm text-slate-700 dark:text-slate-200">{msg}</p>}
      <section>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Waiting for an answer ({groups.length})</h2>
        {groups.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Check className="h-4 w-4 text-emerald-600" /> Nothing to teach right now.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {groups.map((g) => {
              const key = g.ids[0];
              const draft = drafts[key] ?? "";
              return (
                <li key={key} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">&ldquo;{g.text}&rdquo;</p>
                  {g.others.length > 0 && <p className="mt-0.5 text-xs text-slate-500">Also asked as: {g.others.map((o) => `“${o}”`).join(", ")}</p>}
                  <p className="mt-1 text-xs text-slate-400">
                    {g.count} {g.count === 1 ? "person" : "people"} ({g.who.join(", ")}) · {ago(g.latest)}
                    {g.reason ? ` · ${g.reason}` : ""}
                  </p>
                  {g.suggestion && (
                    <button type="button" onClick={() => setDrafts((d) => ({ ...d, [key]: g.suggestion!.answer }))} className="mt-2 text-xs font-medium text-teal-700 hover:underline dark:text-teal-300">
                      Same as “{g.suggestion.question.slice(0, 60)}”? Use that answer
                    </button>
                  )}
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                    rows={3}
                    placeholder="Write the answer the assistant should give"
                    className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13.5px] dark:border-slate-600 dark:bg-slate-900"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={busy === key || !draft.trim()} onClick={() => call({ action: "answer", ids: g.ids, answer: draft, sendNow: true }, key)} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
                      {busy === key && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save and reply to those waiting
                    </button>
                    <button type="button" disabled={busy === key || !draft.trim()} onClick={() => call({ action: "answer", ids: g.ids, answer: draft, sendNow: false }, key)} className="rounded-full border border-slate-300 px-4 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
                      Save only
                    </button>
                    <button type="button" onClick={() => call({ action: "ignore", ids: g.ids }, key)} className="text-[13px] text-slate-500 hover:underline">
                      Not a question to teach
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">What the assistant knows ({saved.length})</h2>
        {saved.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing taught yet. Answers you save above appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
            {saved.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{a.question}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-600 dark:text-slate-300">{a.answer}</p>
                  <p className="mt-1 text-xs text-slate-400">Used {a.uses} {a.uses === 1 ? "time" : "times"}{a.lastUsedAt ? ` · last ${ago(a.lastUsedAt)}` : ""}</p>
                </div>
                <button type="button" onClick={() => call({ action: "toggle", answerId: a.id, active: !a.active }, a.id)} className={`rounded-full px-3 py-1 text-xs font-semibold ${a.active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "border border-slate-300 text-slate-500"}`}>
                  {a.active ? "On" : "Off"}
                </button>
                <button type="button" onClick={() => call({ action: "delete", answerId: a.id }, a.id)} className="text-xs text-slate-400 hover:text-rose-600">
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
