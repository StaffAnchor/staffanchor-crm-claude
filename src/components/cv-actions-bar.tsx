"use client";

import { useEffect, useState } from "react";
import { POOL_TIERS, POOL_TIER_LABEL, POOL_TIER_PILL, reasonRequired, type PoolTier } from "@/lib/talent-pool";

type State = {
  roles: { id: string; title: string; client: string; stage: string | null }[];
  category: string | null;
  subcategory: string | null;
  subcategories: Record<string, string[]>;
  tier: PoolTier | null;
};

const CATEGORIES: { key: string; label: string }[] = [
  { key: "b2b_sales", label: "B2B Sales" },
  { key: "b2c_sales", label: "B2C Sales" },
  { key: "non_sales", label: "Non-Sales" },
];

// Shown under a CV while it is open, so the decision can be made with the CV in front of you: put them on a role,
// add them to a group, or mark how good they are. One line, three actions.
export default function CvActionsBar({ candidateId, showCategory = true }: { candidateId: string; showCategory?: boolean }) {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PoolTier | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let live = true;
    void fetch(`/api/candidates/${candidateId}/cv-actions`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && setSt(j as State))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [candidateId]);

  async function addRole(mandateId: string) {
    if (!mandateId) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/hiring/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairs: [{ candidateId, mandateId }] }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Could not add.");
    setSt((s) => (s ? { ...s, roles: s.roles.map((r) => (r.id === mandateId ? { ...r, stage: r.stage ?? "sourced" } : r)) } : s));
    setMsg(j.already ? "Already on that role." : "Added to the role.");
  }

  // Category and sub-category are one classification: pick the category, then the sub-category under it.
  async function setCategory(category: string, subcategory: string | null) {
    if (!category) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/candidates/profile-group", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, group: category, subgroup: subcategory }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Could not save.");
    setSt((x) => (x ? { ...x, category, subcategory } : x));
    setMsg(subcategory ? "Category saved." : "Category saved. Now pick the sub-category.");
  }

  async function setTier(tier: PoolTier, why: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/talent-pool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, tier, reason: why, tags: [] }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Could not save.");
    setSt((s) => (s ? { ...s, tier } : s));
    setPending(null);
    setReason("");
    setMsg(`Marked ${POOL_TIER_LABEL[tier]}.`);
  }

  const sel = "rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";
  if (!st) return <div className="border-b border-slate-100 px-4 py-2 text-[12px] text-slate-400 dark:border-slate-800">Loading actions…</div>;
  return (
    <div className="border-b border-slate-100 px-4 py-2 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
          Role
          <select className={sel} value="" disabled={busy} onChange={(e) => void addRole(e.target.value)}>
            <option value="">Add to a role…</option>
            {st.roles.map((r) => (
              <option key={r.id} value={r.id} disabled={!!r.stage}>
                {r.title}{r.client ? ` · ${r.client}` : ""}{r.stage ? ` (on it: ${r.stage.replace(/_/g, " ")})` : ""}
              </option>
            ))}
          </select>
        </label>
        {showCategory && (
          <>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
              Category
              <select className={sel} value={st.category && CATEGORIES.some((c) => c.key === st.category) ? st.category : ""} disabled={busy} onChange={(e) => void setCategory(e.target.value, e.target.value === st.category ? st.subcategory : null)}>
                <option value="">{st.category === "unclear" ? "Needs a look…" : "Choose…"}</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            {st.category && st.subcategories[st.category] && (
              <label className="flex items-center gap-1.5 text-[12px] text-slate-500">
                Sub-category
                <select className={sel} value={st.subcategory ?? ""} disabled={busy} onChange={(e) => void setCategory(st.category as string, e.target.value || null)}>
                  <option value="">Choose…</option>
                  {st.subcategories[st.category].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
          Quality
          {POOL_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={busy}
              onClick={() => (reasonRequired(t) ? setPending(pending === t ? null : t) : void setTier(t, ""))}
              className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ring-1 ${st.tier === t || pending === t ? POOL_TIER_PILL[t] : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"}`}
            >
              {POOL_TIER_LABEL[t]}
            </button>
          ))}
        </div>
        {msg && <span className="text-[12px] text-emerald-700 dark:text-emerald-300">{msg}</span>}
      </div>
      {pending && (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Why ${POOL_TIER_LABEL[pending]}? A few words`}
            className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[12px] dark:border-slate-600 dark:bg-slate-900"
          />
          <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => void setTier(pending, reason)} className="rounded-lg bg-teal-600 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">
            Save
          </button>
        </div>
      )}
    </div>
  );
}
