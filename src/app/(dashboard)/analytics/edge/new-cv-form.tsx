"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Makes a CV form link for someone who did not book through the site (a booking has its own "CV form" link).
export default function NewCvForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/cv-briefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Couldn't start.");
    router.push(`/analytics/edge/cv/${j.id}`);
  }
  const cls = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-slate-500">Candidate<br /><input className={cls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" /></label>
      <label className="text-xs text-slate-500">Email (optional)<br /><input className={cls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" /></label>
      <button onClick={go} disabled={busy || name.trim().length < 2} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Making…" : "Make a CV form link"}</button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  );
}
