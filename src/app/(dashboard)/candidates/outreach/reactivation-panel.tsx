"use client";

import { useState } from "react";
import { Loader2, Send, Users } from "lucide-react";
import { RoleLevelSelect, RoleTypeSelect, useRoleClusters } from "@/components/role-type-fields";

const METROS = ["Bengaluru", "Delhi NCR", "Mumbai (MMR)", "Pune", "Hyderabad", "Chennai", "Kolkata", "Ahmedabad", "Other India"];

type Person = { id: string; name: string; line: string; metro: string | null; level: string | null; tier: string | null };
type Preview = { total: number; cap: number; room: number; role: string; people: Person[]; sample: { subject: string; html: string } };

const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

// Pick a kind of person in the database, review exactly who gets the email and what it says, then send. A person
// presses every send; people emailed in the last 30 days, opted out, or resting after "not right now" are left out.
export default function ReactivationPanel() {
  const clusters = useRoleClusters();
  const [cluster, setCluster] = useState("");
  const [level, setLevel] = useState("");
  const [metro, setMetro] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/reactivation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cluster, level: level || undefined, metro: metro || undefined, ...body }) }).then(async (r) => ({ res: r, d: await r.json().catch(() => ({})) }));

  async function find() {
    if (!cluster) return setMsg("Choose a role type first.");
    setBusy(true);
    setMsg(null);
    const { res, d } = await post({ action: "preview" });
    setBusy(false);
    if (!res.ok || d.ok === false) return setMsg(d.error ?? "Couldn't look that up.");
    setPreview(d as Preview);
    setPicked(new Set((d.people as Person[]).slice(0, Math.min(30, d.room ?? 30)).map((p) => p.id)));
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    const { res, d } = await post({ action: "send", ids: Array.from(picked) });
    setBusy(false);
    if (!res.ok || d.ok === false) return setMsg(d.error ?? "That didn't work. Nothing was sent.");
    setMsg(`Sent ${d.sent}${d.failed ? `, ${d.failed} failed` : ""}.${d.note ? ` ${d.note}` : ""}`);
    setPreview(null);
    setPicked(new Set());
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Users className="h-4 w-4 text-teal-600" /> Re-engage your database
      </h2>
      <p className="mt-1 text-[13px] text-slate-500">
        Ask people you already know whether they&apos;d like to hear about new roles. One tap tells us, and anyone who says yes ranks higher for matching roles.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RoleTypeSelect value={cluster} onChange={setCluster} clusters={clusters} className={sel} />
        <RoleLevelSelect value={level} onChange={setLevel} className={sel} />
        <select value={metro} onChange={(e) => setMetro(e.target.value)} className={sel}>
          <option value="">Any city</option>
          {METROS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button type="button" onClick={find} disabled={busy || !cluster} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-50">
          {busy && !preview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Find people
        </button>
      </div>
      {msg && <p className="mt-3 text-[13px] text-slate-700 dark:text-slate-200">{msg}</p>}

      {preview && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] text-slate-700 dark:text-slate-200">
              <b>{preview.total}</b> {preview.role} contacts can be emailed. Showing the first {preview.people.length}, top-rated first. {preview.room} left under today&apos;s limit of {preview.cap}.
            </p>
            {preview.people.length === 0 ? (
              <p className="text-[13px] text-slate-400">Nobody eligible for this group right now.</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {preview.people.map((p) => (
                  <li key={p.id}>
                    <label className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2 text-[13px] dark:border-slate-800">
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="mt-1" />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                        {p.tier && <span className="ml-2 text-xs text-teal-700">Rated {p.tier}</span>}
                        <span className="block truncate text-xs text-slate-500">{[p.line, p.metro].filter(Boolean).join(" · ") || "No role on file"}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={send} disabled={busy || picked.size === 0} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to {picked.size}
            </button>
            <p className="mt-1.5 text-xs text-slate-500">Goes out in a paced batch of up to 30 per press, from the team mailbox.</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-slate-500">Subject: {preview.sample.subject}</p>
            <iframe title="Email preview" srcDoc={preview.sample.html} sandbox="" className="h-[460px] w-full rounded-md border border-slate-200 bg-white dark:border-slate-700" />
          </div>
        </div>
      )}
    </section>
  );
}
