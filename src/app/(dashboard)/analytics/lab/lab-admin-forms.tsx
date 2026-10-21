"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function act(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ...j } as { ok: boolean; error?: string; id?: string; sent?: number };
}

const input = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const btn = "rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";

export function CreateCohortForm() {
  const router = useRouter();
  const [company, setCompany] = useState("");
  const [name, setName] = useState("Sales Leaders Lab");
  const [start, setStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    const r = await act({ action: "create_cohort", company, name, startDate: start });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Couldn't create.");
    router.push(`/analytics/lab/${r.id}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Company<br /><input className={input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Client company" /></label>
      <label className="text-xs text-slate-500">Cohort name<br /><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-xs text-slate-500">Starts<br /><input type="date" className={input} value={start} onChange={(e) => setStart(e.target.value)} /></label>
      <button onClick={go} disabled={busy || company.trim().length < 2} className={btn}>{busy ? "Creating…" : "Create cohort"}</button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}

export function AddMemberForm({ cohortId, heads }: { cohortId: string; heads: { id: string; name: string }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("manager");
  const [reportsTo, setReportsTo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true); setErr(null);
    const r = await act({ action: "add_member", cohortId, email, fullName, role, reportsTo: role === "manager" ? reportsTo : "" });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Couldn't add.");
    setEmail(""); setFullName("");
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Email<br /><input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></label>
      <label className="text-xs text-slate-500">Name<br /><input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
      <label className="text-xs text-slate-500">Role<br />
        <select className={input} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="manager">Manager (participant)</option><option value="sales_head">Sales head</option><option value="management">Founder / management</option><option value="facilitator">Facilitator</option>
        </select>
      </label>
      {role === "manager" && (
        <label className="text-xs text-slate-500">Reports to<br />
          <select className={input} value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}><option value="">Not set</option>{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        </label>
      )}
      <button onClick={go} disabled={busy || !email} className={btn}>{busy ? "Adding…" : "Add person"}</button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}

export function MemberActions({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function invite() {
    const r = await act({ action: "invite", memberIds: [memberId] });
    setMsg(r.ok && r.sent ? "Invite sent" : "Couldn't send");
    router.refresh();
  }
  async function remove() {
    if (!confirm("Remove this person from the cohort? Their entries are kept but they lose access.")) return;
    await act({ action: "remove_member", memberId });
    router.refresh();
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button onClick={invite} className="font-medium text-teal-700 hover:underline">Send invite</button>
      <button onClick={remove} className="text-slate-400 hover:text-red-600">Remove</button>
      {msg && <span className="text-slate-500">{msg}</span>}
    </span>
  );
}

export function InviteAll({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!confirm(`Email a sign-in invite to ${ids.length} people?`)) return;
    setBusy(true);
    const r = await act({ action: "invite", memberIds: ids });
    setBusy(false);
    setMsg(r.ok ? `Sent ${r.sent} invite${r.sent === 1 ? "" : "s"}` : r.error ?? "Couldn't send");
    router.refresh();
  }
  return (
    <span className="flex items-center gap-2">
      <button onClick={go} disabled={busy || ids.length === 0} className={btn}>{busy ? "Sending…" : "Invite everyone"}</button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </span>
  );
}

export function ReportsToSelect({ memberId, value, heads }: { memberId: string; value: string; heads: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <select className={`${input} py-1`} value={value} onChange={async (e) => { await act({ action: "update_member", memberId, reportsTo: e.target.value }); router.refresh(); }}>
      <option value="">Not set</option>{heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
    </select>
  );
}

export function SessionDate({ sessionId, value }: { sessionId: string; value: string }) {
  const router = useRouter();
  return <input type="date" className={`${input} py-1`} defaultValue={value} onChange={async (e) => { await act({ action: "set_session_date", sessionId, heldOn: e.target.value }); router.refresh(); }} />;
}

export function AttendanceCell({ sessionId, memberId, value }: { sessionId: string; memberId: string; value: boolean | null }) {
  const router = useRouter();
  const [v, setV] = useState<boolean | null>(value);
  async function set(next: boolean) {
    setV(next);
    const r = await act({ action: "set_attendance", sessionId, memberId, present: next });
    if (!r.ok) setV(value); else router.refresh();
  }
  return (
    <span className="inline-flex overflow-hidden rounded-md text-xs ring-1 ring-slate-200">
      <button onClick={() => set(true)} className={`px-2 py-1 ${v === true ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>P</button>
      <button onClick={() => set(false)} className={`px-2 py-1 ${v === false ? "bg-rose-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>A</button>
    </span>
  );
}

export function ScorecardWeights({ cohortId, weights, locked }: { cohortId: string; weights: { key: string; label: string; weight: number }[]; locked: boolean }) {
  const router = useRouter();
  const [w, setW] = useState<Record<string, string>>(() => Object.fromEntries(weights.map((x) => [x.key, String(x.weight)])));
  const [lock, setLock] = useState(locked);
  const [msg, setMsg] = useState<string | null>(null);
  const total = Object.values(w).reduce((a, x) => a + (Number(x) || 0), 0);
  async function save() {
    setMsg(null);
    const r = await act({ action: "set_scorecard", cohortId, weights: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])), locked: lock } as Record<string, unknown>);
    setMsg(r.ok ? "Saved." : r.error ?? "Couldn't save.");
    if (r.ok) router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {weights.map((x) => (
          <label key={x.key} className="text-xs text-slate-500">{x.label}<br /><input className={`${input} w-24`} inputMode="numeric" value={w[x.key]} onChange={(e) => setW({ ...w, [x.key]: e.target.value.replace(/\D/g, "") })} /></label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={total === 100 ? "text-emerald-700" : "text-red-600"}>Total {total} of 100</span>
        <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} /> Lock the weights (after the baseline is agreed)</label>
        <button onClick={save} disabled={total !== 100} className={btn}>Save weights</button>
        {msg && <span className="text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

export function ForecastBand({ cohortId, low, high }: { cohortId: string; low: number; high: number }) {
  const router = useRouter();
  const [l, setL] = useState(String(low));
  const [h, setH] = useState(String(high));
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const r = await act({ action: "set_forecast_band", cohortId, low: Number(l), high: Number(h) } as Record<string, unknown>);
    setMsg(r.ok ? "Saved." : r.error ?? "Couldn't save.");
    if (r.ok) router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="text-xs text-slate-500">Accurate from<br /><input className={`${input} w-24`} inputMode="numeric" value={l} onChange={(e) => setL(e.target.value.replace(/\D/g, ""))} /></label>
      <label className="text-xs text-slate-500">to<br /><input className={`${input} w-24`} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} /></label>
      <button onClick={save} className={btn}>Save band</button>
      {msg && <span className="text-slate-600">{msg}</span>}
    </div>
  );
}
