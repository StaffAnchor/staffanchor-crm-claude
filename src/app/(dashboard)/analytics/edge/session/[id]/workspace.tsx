"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DIAGNOSIS_ROWS, LEVELS, RATINGS, SECTIONS, TRACKS, filled, proofFields,
  type Level, type Rating, type SectionKey, type SessionData, type Track,
} from "@/lib/session-report/config";

type Initial = { name: string; email: string; phone: string; track: Track; level: Level; data: SessionData; status: "draft" | "final"; sentAt: string | null; sentTo: string | null };
type Booking = { service: string; slot: string | null; notes: string | null; targetRole: string | null; source: string | null } | null;

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[14px] outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const lbl = "mb-1 block text-xs font-medium text-slate-500";

export default function Workspace({ id, initial, booking, intake }: { id: string; initial: Initial; booking: Booking; intake: { label: string; value: string }[] }) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [track, setTrack] = useState<Track>(initial.track);
  const [level, setLevel] = useState<Level>(initial.level);
  const [d, setD] = useState<SessionData>(initial.data);
  const [status, setStatus] = useState(initial.status);
  const [sent, setSent] = useState<{ at: string | null; to: string | null }>({ at: initial.sentAt, to: initial.sentTo });
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mailOpen, setMailOpen] = useState(false);
  const dirty = useRef(false);
  const first = useRef(true);

  // Timer for the 45 minutes: starts when you press it, and says which part of the meeting you should be in.
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  const mins = secs / 60;
  const current = SECTIONS.find((s) => {
    const m = s.minutes.match(/^(\d+)–(\d+)$/);
    return m ? mins >= Number(m[1]) && mins < Number(m[2]) : false;
  });

  const persist = useCallback(async () => {
    setSave("saving");
    try {
      const res = await fetch(`/api/admin/edge-sessions/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: d, track, level, name, email, phone }) });
      if (!res.ok) throw new Error("save failed");
      dirty.current = false;
      setSave("saved");
      setSavedAt(new Date());
    } catch {
      setSave("error");
    }
  }, [id, d, track, level, name, email, phone]);

  // Saves about a second after the last change, so nothing is lost if the tab closes or the call runs over.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(() => void persist(), 900);
    return () => clearTimeout(t);
  }, [d, track, level, name, email, phone, persist]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const f = useMemo(() => filled(d), [d]);
  const patch = <K extends keyof SessionData>(k: K, v: SessionData[K]) => setD((x) => ({ ...x, [k]: v }));
  const setInc = (k: SectionKey, v: boolean) => setD((x) => ({ ...x, include: { ...x.include, [k]: v } }));
  const proof = proofFields(track, level);

  async function mark(action: "final" | "reopen") {
    await persist();
    const res = await fetch(`/api/admin/edge-sessions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (res.ok) setStatus(action === "final" ? "final" : "draft");
  }
  async function openPdf(download: boolean) {
    await persist();
    window.open(`/api/admin/edge-sessions/${id}/pdf${download ? "" : "?inline=1"}`, "_blank");
  }

  const header = (k: SectionKey) => {
    const s = SECTIONS.find((x) => x.key === k)!;
    return (
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{s.label} <span className="ml-1 text-xs font-normal text-slate-400">{s.minutes === "any time" ? "any time" : `${s.minutes} min`}</span></h2>
          <p className="text-xs text-slate-500">{s.hint}</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={d.include[k]} onChange={(e) => setInc(k, e.target.checked)} /> Include in report</label>
      </div>
    );
  };
  const text = (label: string, value: string, set: (v: string) => void, ph = "", rows = 0) => (
    <label className="block">
      <span className={lbl}>{label}</span>
      {rows ? <textarea className={input} rows={rows} value={value} placeholder={ph} onChange={(e) => set(e.target.value)} /> : <input className={input} value={value} placeholder={ph} onChange={(e) => set(e.target.value)} />}
    </label>
  );
  const sn = d.snapshot;
  const setSn = (k: keyof SessionData["snapshot"]) => (v: string) => patch("snapshot", { ...sn, [k]: v });
  const sinceSave = savedAt ? savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="mt-3">
      {/* top bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-semibold text-slate-900 dark:text-slate-100">{name || "Session report"}</h1>
            <p className="text-xs text-slate-500">
              {save === "saving" ? "Saving…" : save === "error" ? <span className="text-red-600">Couldn&apos;t save. Keep this tab open and check your connection.</span> : savedAt ? `Saved at ${sinceSave}` : "Saved"} · {status === "final" ? "Marked final" : "Draft"}{sent.at ? ` · sent to ${sent.to} on ${new Date(sent.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-800">
            <span className="tabular-nums font-semibold">{String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</span>
            <button onClick={() => setRunning(!running)} className="text-xs font-medium text-teal-700 hover:underline">{running ? "Pause" : secs ? "Resume" : "Start 45 min"}</button>
            {current && <span className="text-xs text-slate-500">· now: {current.label}</span>}
          </div>
          <button onClick={() => openPdf(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-700">Preview PDF</button>
          <button onClick={() => openPdf(true)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-700">Download</button>
          <button onClick={() => setMailOpen(true)} className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700">Email to candidate</button>
          <button onClick={() => mark(status === "final" ? "reopen" : "final")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-700">{status === "final" ? "Reopen" : "Mark final"}</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
        {/* section nav */}
        <nav className="lg:sticky lg:top-24 lg:h-fit">
          <ul className="flex gap-1.5 overflow-x-auto lg:block lg:space-y-1">
            {SECTIONS.map((s, i) => (
              <li key={s.key} className="shrink-0">
                <a href={`#sec-${s.key}`} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-slate-100 dark:hover:bg-slate-800 ${current?.key === s.key ? "bg-teal-50 font-semibold text-teal-800 dark:bg-teal-950/30" : "text-slate-700 dark:text-slate-300"}`}>
                  <span>{i + 1}. {s.label}</span><span className={f[s.key] ? "text-emerald-600" : "text-slate-300"}>{f[s.key] ? "✓" : "○"}</span>
                </a>
              </li>
            ))}
            <li className="shrink-0"><a href="#sec-private" className="block rounded-lg px-3 py-2 text-[13px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Private notes</a></li>
          </ul>
        </nav>

        <div className="space-y-5">
          {/* who + kind of role */}
          <section className={card}>
            <div className="grid gap-3 sm:grid-cols-3">
              {text("Candidate", name, setName)}
              {text("Email (for sending the report)", email, setEmail)}
              {text("Mobile", phone, setPhone)}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <span className={lbl}>Kind of role</span>
                <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
                  {TRACKS.map((t) => <button key={t.key} onClick={() => setTrack(t.key)} className={`px-3.5 py-1.5 text-[13px] ${track === t.key ? "bg-teal-600 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t.label}</button>)}
                </div>
              </div>
              <div>
                <span className={lbl}>Level</span>
                <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
                  {LEVELS.map((t) => <button key={t.key} onClick={() => setLevel(t.key)} className={`px-3.5 py-1.5 text-[13px] ${level === t.key ? "bg-teal-600 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{t.label}</button>)}
                </div>
              </div>
              <p className="max-w-md text-xs text-slate-500">This changes the prompts in Positioning (for example team size and revenue owned for leaders), not the report layout.</p>
            </div>
            {(booking || intake.length > 0) && (
              <details className="mt-4 rounded-lg bg-slate-50 p-3 text-[13px] dark:bg-slate-800/50">
                <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">What they told us when they booked (for you only, never in the report)</summary>
                <div className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
                  {booking?.targetRole && <p><span className="text-slate-400">Target role:</span> {booking.targetRole}</p>}
                  {booking?.notes && <p><span className="text-slate-400">Note at booking:</span> {booking.notes}</p>}
                  {booking?.source && <p><span className="text-slate-400">Came from:</span> {booking.source}</p>}
                  {intake.map((i) => <p key={i.label}><span className="text-slate-400">{i.label}:</span> <span className="whitespace-pre-wrap">{i.value}</span></p>)}
                </div>
              </details>
            )}
          </section>

          {/* 1 snapshot and goal */}
          <section id="sec-snapshot" className={`${card} scroll-mt-28`}>
            {header("snapshot")}
            <div className="grid gap-3 sm:grid-cols-2">
              {text("Current role", sn.currentRole, setSn("currentRole"))}
              {text("Current company", sn.currentCompany, setSn("currentCompany"))}
              {text("Experience", sn.experienceYears, setSn("experienceYears"), "For example 11 years")}
              {text("Location and relocation", sn.location, setSn("location"))}
              {text("Current CTC", sn.currentCtc, setSn("currentCtc"), "Optional")}
              {text("Expected CTC", sn.expectedCtc, setSn("expectedCtc"), "Optional")}
              {text("Notice period", sn.noticePeriod, setSn("noticePeriod"))}
              {text("Target roles", sn.targetRoles, setSn("targetRoles"))}
              {text("Target industries", sn.targetIndustries, setSn("targetIndustries"))}
            </div>
            <div className="mt-3 grid gap-3">
              {text("Their goal", d.goal.goal, (v) => patch("goal", { ...d.goal, goal: v }), "What role, what level?", 2)}
              <div className="grid gap-3 sm:grid-cols-2">
                {text("By when", d.goal.timeline, (v) => patch("goal", { ...d.goal, timeline: v }))}
                {text("What they have tried so far", d.goal.tried, (v) => patch("goal", { ...d.goal, tried: v }), "Applications, recruiters, what happened", 2)}
              </div>
            </div>
          </section>

          {/* 2 diagnosis */}
          <section id="sec-diagnosis" className={`${card} scroll-mt-28`}>
            {header("diagnosis")}
            <div className="space-y-4">
              {DIAGNOSIS_ROWS.map((r) => {
                const row = d.diagnosis[r.key];
                const setRow = (v: Partial<typeof row>) => patch("diagnosis", { ...d.diagnosis, [r.key]: { ...row, ...v } });
                return (
                  <div key={r.key} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><p className="text-sm font-semibold">{r.label}</p><p className="text-xs text-slate-500">{r.ask}</p></div>
                      <div className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-300">
                        {RATINGS.map((x) => {
                          const on = row.rating === x.key;
                          const tone = x.key === "strong" ? "bg-emerald-600" : x.key === "ok" ? "bg-amber-500" : "bg-rose-600";
                          return <button key={x.key} onClick={() => setRow({ rating: (on ? null : x.key) as Rating })} className={`px-3 py-1.5 text-[13px] ${on ? `${tone} font-semibold text-white` : "bg-white text-slate-600 hover:bg-slate-50"}`}>{x.label}</button>;
                        })}
                      </div>
                    </div>
                    <textarea className={`${input} mt-2`} rows={2} placeholder="What you see, and what to do about it" value={row.note} onChange={(e) => setRow({ note: e.target.value })} />
                  </div>
                );
              })}
              {text("In summary", d.diagnosis.summary, (v) => patch("diagnosis", { ...d.diagnosis, summary: v }), "One or two lines", 2)}
            </div>
          </section>

          {/* 3 market map */}
          <section id="sec-market" className={`${card} scroll-mt-28`}>
            {header("market")}
            <div className="space-y-2">
              {d.market.targets.map((t, i) => {
                const setT = (v: Partial<typeof t>) => patch("market", { ...d.market, targets: d.market.targets.map((x, j) => (j === i ? { ...x, ...v } : x)) });
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1.1fr_1.3fr_1.3fr_auto]">
                    <input className={input} placeholder="Company or segment" value={t.company} onChange={(e) => setT({ company: e.target.value })} />
                    <input className={input} placeholder="Why it fits" value={t.why} onChange={(e) => setT({ why: e.target.value })} />
                    <input className={input} placeholder="Best route in" value={t.route} onChange={(e) => setT({ route: e.target.value })} />
                    <button onClick={() => patch("market", { ...d.market, targets: d.market.targets.length > 1 ? d.market.targets.filter((_, j) => j !== i) : d.market.targets })} className="px-2 text-xs text-slate-400 hover:text-red-600">Remove</button>
                  </div>
                );
              })}
              <button onClick={() => patch("market", { ...d.market, targets: [...d.market.targets, { company: "", why: "", route: "" }].slice(0, 15) })} className="text-[13px] font-medium text-teal-700 hover:underline">+ Add a company or segment</button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {text("Recruiters and search firms to approach", d.market.recruiters, (v) => patch("market", { ...d.market, recruiters: v }), "", 2)}
              {text("People to ask for introductions", d.market.referrals, (v) => patch("market", { ...d.market, referrals: v }), "", 2)}
            </div>
          </section>

          {/* 4 positioning */}
          <section id="sec-positioning" className={`${card} scroll-mt-28`}>
            {header("positioning")}
            {text("Their story in one line", d.positioning.story, (v) => patch("positioning", { ...d.positioning, story: v }), "What they do, for whom, with what result", 2)}
            <p className="mb-1 mt-4 text-xs font-medium text-slate-500">Numbers that prove it ({track === "sales" ? "sales" : "non-sales"}{level !== "individual" ? ", leadership" : ""})</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {proof.map((p) => text(p.label, d.positioning.proof[p.key] ?? "", (v) => patch("positioning", { ...d.positioning, proof: { ...d.positioning.proof, [p.key]: v } }), p.ph))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {text("LinkedIn headline now", d.positioning.headlineBefore, (v) => patch("positioning", { ...d.positioning, headlineBefore: v }))}
              {text("LinkedIn headline, suggested", d.positioning.headlineAfter, (v) => patch("positioning", { ...d.positioning, headlineAfter: v }))}
            </div>
            <div className="mt-3">{text("About section, suggested", d.positioning.aboutAfter, (v) => patch("positioning", { ...d.positioning, aboutAfter: v }), "Write it with them, live", 4)}</div>
          </section>

          {/* 5 outreach */}
          <section id="sec-outreach" className={`${card} scroll-mt-28`}>
            {header("outreach")}
            <div className="grid gap-3">
              {text("Message to a hiring manager", d.outreach.toManager, (v) => patch("outreach", { ...d.outreach, toManager: v }), "", 3)}
              {text("Message to a recruiter", d.outreach.toRecruiter, (v) => patch("outreach", { ...d.outreach, toRecruiter: v }), "", 3)}
              {text("Follow-up message", d.outreach.followUp, (v) => patch("outreach", { ...d.outreach, followUp: v }), "", 2)}
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                {text("Approaches a week", d.outreach.weeklyApproaches, (v) => patch("outreach", { ...d.outreach, weeklyApproaches: v.replace(/\D/g, "") }), "For example 10")}
                {text("Weekly routine", d.outreach.routine, (v) => patch("outreach", { ...d.outreach, routine: v }), "Which day does what", 2)}
              </div>
            </div>
          </section>

          {/* 6 resume points */}
          <section id="sec-resume" className={`${card} scroll-mt-28`}>
            {header("resume")}
            <div className="grid gap-3 sm:grid-cols-3">
              {text("Keep", d.resume.keep, (v) => patch("resume", { ...d.resume, keep: v }), "One point a line", 4)}
              {text("Fix", d.resume.fix, (v) => patch("resume", { ...d.resume, fix: v }), "One point a line", 4)}
              {text("Add", d.resume.add, (v) => patch("resume", { ...d.resume, add: v }), "One point a line", 4)}
            </div>
          </section>

          {/* 7 actions */}
          <section id="sec-actions" className={`${card} scroll-mt-28`}>
            {header("actions")}
            <div className="space-y-2">
              {d.actions.items.map((a, i) => {
                const setA = (v: Partial<typeof a>) => patch("actions", { ...d.actions, items: d.actions.items.map((x, j) => (j === i ? { ...x, ...v } : x)) });
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                    <input className={input} placeholder={`Action ${i + 1}`} value={a.action} onChange={(e) => setA({ action: e.target.value })} />
                    <input className={input} placeholder="By when" value={a.due} onChange={(e) => setA({ due: e.target.value })} />
                    <button onClick={() => patch("actions", { ...d.actions, items: d.actions.items.length > 1 ? d.actions.items.filter((_, j) => j !== i) : d.actions.items })} className="px-2 text-xs text-slate-400 hover:text-red-600">Remove</button>
                  </div>
                );
              })}
              <button onClick={() => patch("actions", { ...d.actions, items: [...d.actions.items, { action: "", due: "" }].slice(0, 8) })} className="text-[13px] font-medium text-teal-700 hover:underline">+ Add an action</button>
            </div>
            <div className="mt-3">{text("In short (two or three lines for the candidate, shown at the top of the report)", d.actions.inShort, (v) => patch("actions", { ...d.actions, inShort: v }), "", 3)}</div>
          </section>

          {/* private */}
          <section id="sec-private" className={`${card} scroll-mt-28 border-dashed`}>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Private notes</h2>
            <p className="mb-2 text-xs text-slate-500">Only for you. These are never in the report or the email.</p>
            <textarea className={input} rows={5} value={d.privateNotes} onChange={(e) => patch("privateNotes", e.target.value)} placeholder="Impressions, follow-up ideas, anything you would not want the candidate to read" />
          </section>
        </div>
      </div>

      {mailOpen && <MailModal id={id} to={email} name={name} onClose={() => setMailOpen(false)} onSent={(to) => { setSent({ at: new Date().toISOString(), to }); setMailOpen(false); }} persist={persist} />}
    </div>
  );
}

function MailModal({ id, to: to0, name, onClose, onSent, persist }: { id: string; to: string; name: string; onClose: () => void; onSent: (to: string) => void; persist: () => Promise<void> }) {
  const [to, setTo] = useState(to0);
  const [msg, setMsg] = useState("Thank you for your time today. Your plan from our session is attached. Please reply to this email if you have any questions.");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setErr(null);
    await persist();
    const res = await fetch(`/api/admin/edge-sessions/${id}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, message: msg }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Couldn't send.");
    onSent(j.sentTo ?? to);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-semibold">Email the report to {name || "the candidate"}</h3>
        <p className="mt-1 text-xs text-slate-500">Sent from info@staffanchor.com with a copy to you, with the PDF attached. It goes only when you press Send.</p>
        <label className="mt-3 block"><span className={lbl}>To</span><input className={input} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="mt-3 block"><span className={lbl}>Your note (they see this above your signature)</span><textarea className={input} rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-[13px] font-medium hover:bg-slate-50">Cancel</button>
          <button onClick={send} disabled={busy || !to.trim()} className="rounded-lg bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
