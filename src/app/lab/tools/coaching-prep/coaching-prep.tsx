"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ROOT_CAUSES, coachingSummary } from "@/lib/lab/calc";

export type Saved = { id: string; coachedOn: string; repRef: string; recordRef: string; observed: string; gap: string; question: string; practice: string; commitment: string; followUpNote: string; followUpOn: string; followedUp: boolean };
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const blank = (): Saved => ({ id: "", coachedOn: new Date().toISOString().slice(0, 10), repRef: "", recordRef: "", observed: "", gap: "", question: "", practice: "", commitment: "", followUpNote: "", followUpOn: "", followedUp: false });

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/coaching-prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-500">Date<input type="date" className={input} value={f.coachedOn} onChange={(e) => set("coachedOn", e.target.value)} /></label>
        <label className="text-xs text-slate-500">Rep ID or initials<input className={input} value={f.repRef} onChange={(e) => set("repRef", e.target.value)} /></label>
        <label className="text-xs text-slate-500">Record reference<input className={input} value={f.recordRef} onChange={(e) => set("recordRef", e.target.value)} placeholder="Call or deal ID from your system" /></label>
      </div>
      <label className="block text-xs text-slate-500">Observed behaviour (a fact, not an opinion)<textarea className={input} rows={2} value={f.observed} onChange={(e) => set("observed", e.target.value)} placeholder="For example: did not ask about budget" /></label>
      <div>
        <p className="text-xs text-slate-500">The gap</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ROOT_CAUSES.map((c) => (
            <button key={c.key} type="button" title={c.hint} onClick={() => set("gap", f.gap === c.key ? "" : c.key)} className={`rounded-full px-3 py-1 text-sm ring-1 ${f.gap === c.key ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{c.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Skill: they do not know how. Will: they know but do not want to. System: the process, tool or target gets in the way. Fix the system first.</p>
      </div>
      <label className="block text-xs text-slate-500">Question to explore<input className={input} value={f.question} onChange={(e) => set("question", e.target.value)} placeholder="For example: what stopped you from asking about budget?" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">Practice or support agreed<input className={input} value={f.practice} onChange={(e) => set("practice", e.target.value)} placeholder="For example: role-play the budget question twice" /></label>
        <label className="block text-xs text-slate-500">Rep&apos;s commitment<input className={input} value={f.commitment} onChange={(e) => set("commitment", e.target.value)} placeholder="For example: ask it on the next 5 calls" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">Follow-up in your existing process<input className={input} value={f.followUpNote} onChange={(e) => set("followUpNote", e.target.value)} placeholder="For example: check at the next one-on-one" /></label>
        <label className="block text-xs text-slate-500">Follow-up date<input type="date" className={input} value={f.followUpOn} onChange={(e) => set("followUpOn", e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : f.id ? "Update" : "Save coaching prep"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function CoachingPrep({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const sum = useMemo(() => coachingSummary(saved.map((s) => ({ repRef: s.repRef, gap: (s.gap || null) as "skill" | "will" | "system" | "unclear" | null, followUpOn: s.followUpOn || null, followedUp: s.followedUp }))), [saved]);
  async function toggle(id: string, value: boolean) {
    await fetch("/api/lab/coaching-prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "followed_up", value }) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this coaching prep?")) return;
    await fetch(`/api/lab/coaching-prep?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  const label = (k: string) => ROOT_CAUSES.find((c) => c.key === k)?.label ?? "";
  return (
    <div className="space-y-5">
      {sum.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={card}><p className="text-xs text-slate-500">Conversations</p><p className="text-2xl font-semibold">{sum.total}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Reps coached</p><p className="text-2xl font-semibold">{sum.reps}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Skill / Will / System</p><p className="text-2xl font-semibold">{sum.gaps.skill} / {sum.gaps.will} / {sum.gaps.system}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Follow-ups done</p><p className="text-2xl font-semibold">{sum.followedUp} <span className="text-sm font-normal text-slate-500">of {sum.followUps}</span></p></div>
        </div>
      )}
      <section className={card}>
        <h2 className="text-base font-semibold">Prepare a coaching conversation</h2>
        <p className="mt-0.5 mb-3 text-xs text-slate-500">Use before an existing one-on-one or coaching conversation. Refer to approved call or deal records. Do not copy confidential detail, and use rep IDs, not names.</p>
        <Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} />
      </section>
      {saved.length > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Your coaching conversations</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {saved.map((r) => (
              <li key={r.id} className="py-3">
                {editing === r.id ? (
                  <Form initial={r} onDone={() => setEditing(null)} />
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.coachedOn} · {r.repRef}{r.recordRef ? <span className="font-normal text-slate-500"> · {r.recordRef}</span> : null}{r.gap ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{label(r.gap)}</span> : null}</p>
                      <span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(r.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600">Delete</button></span>
                    </div>
                    <p><span className="text-slate-500">Observed:</span> {r.observed}</p>
                    {r.question && <p><span className="text-slate-500">Question:</span> {r.question}</p>}
                    {(r.practice || r.commitment) && <p className="text-slate-600">{r.practice && <>Support: {r.practice}. </>}{r.commitment && <>Commitment: {r.commitment}.</>}</p>}
                    {(r.followUpNote || r.followUpOn) && (
                      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {r.followUpOn && <input type="checkbox" checked={r.followedUp} onChange={(e) => toggle(r.id, e.target.checked)} />}
                        Follow-up{r.followUpOn ? ` on ${r.followUpOn}` : ""}{r.followUpNote ? `: ${r.followUpNote}` : ""}{r.followUpOn && !r.followedUp && r.followUpOn < today && <span className="font-medium text-rose-700">overdue</span>}
                      </label>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
