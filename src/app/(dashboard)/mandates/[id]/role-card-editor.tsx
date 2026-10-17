"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { CardLevel, RoleCard } from "@/lib/role-card";
import { LEVEL_VALUES } from "@/lib/role-card";

type Opt = { slug: string; name: string };
const LEVEL_LABEL: Record<CardLevel, string> = { any: "Any level", ic: "Individual contributor", team_lead: "Team lead", manager: "Manager", director: "Director", vp_plus: "VP and above" };
const CITY_CHOICES = ["Bengaluru", "Delhi NCR", "Mumbai (MMR)", "Hyderabad", "Pune", "Chennai", "Kolkata", "Ahmedabad"];
const CUSTOMERS = ["dealers", "channel-partners", "smb", "mid-market", "enterprise", "consumers", "government", "startups"];

// The role card: what this role really needs. It is written automatically from the mandate; adjust anything here
// and the ranking below follows. Nothing is sent to anyone from this card.
export default function RoleCardEditor({
  mandateId,
  card,
  confirmed,
  clusters,
  worlds,
}: {
  mandateId: string;
  card: RoleCard;
  confirmed: boolean;
  clusters: Opt[];
  worlds: Opt[];
}) {
  const router = useRouter();
  const [c, setC] = useState<RoleCard>(card);
  // Closed by default: the card is a summary line until someone wants to change it.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"save" | "rewrite" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = (slug: string) => worlds.find((w) => w.slug === slug)?.name ?? slug;

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ card: c }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Couldn't save.");
      else {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }
  async function rewrite() {
    setBusy("rewrite");
    setError(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) setError(d.error ?? "Couldn't rewrite.");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const chip = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium";
  const num = (v: number | null) => (v == null ? "" : String(v));
  const parse = (v: string) => (v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  return (
    <div className="rounded-ros-xl border border-teal-200 bg-teal-50/40 p-4 dark:border-teal-900 dark:bg-teal-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-600" />
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">What this role really needs</h3>
        <span className="text-[12px] text-slate-400">{confirmed ? "Checked" : "Written by the system"}</span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto text-[12px] font-medium text-blue-600 hover:underline">
          {open ? "Done" : confirmed ? "Adjust" : "Check it"}
        </button>
      </div>

      <p className="mt-2 text-[13px] text-slate-700 dark:text-slate-200">
        <span className="font-semibold">{clusters.find((x) => x.slug === c.cluster)?.name ?? c.cluster}</span>
        {c.level !== "any" ? `, ${LEVEL_LABEL[c.level].toLowerCase()}` : ""}
        {c.sells_summary ? `. ${c.sells_summary}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.exact_worlds.map((w) => (
          <span key={w} className={`${chip} bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200`}>
            Ideal: {name(w)}
          </span>
        ))}
        {c.adjacent_worlds.map((a) => (
          <span key={a.slug} title={a.why} className={`${chip} bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200`}>
            Also fine: {name(a.slug)}
          </span>
        ))}
        {c.cities.map((x) => (
          <span key={x} className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200`}>
            {x}
          </span>
        ))}
        {(c.exp_min != null || c.exp_max != null) && <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200`}>{c.exp_min ?? 0}-{c.exp_max ?? "+"} yrs</span>}
        {c.budget_max != null && <span className={`${chip} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200`}>Up to {c.budget_max} LPA</span>}
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-teal-200/70 pt-4 text-[12.5px] dark:border-teal-900">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-slate-500">
              What the person does
              <select value={c.cluster} onChange={(e) => setC({ ...c, cluster: e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {clusters.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-slate-500">
              Level
              <select value={c.level} onChange={(e) => setC({ ...c, level: e.target.value as CardLevel })} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                {LEVEL_VALUES.filter((l) => l !== "any").map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-slate-500">
              What they will sell, and to whom
              <input value={c.sells_summary} onChange={(e) => setC({ ...c, sells_summary: e.target.value })} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
            </label>
          </div>

          <div>
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Ideal worlds (they already sell into these)</p>
            <div className="flex flex-wrap gap-1.5">
              {c.exact_worlds.map((w) => (
                <button key={w} type="button" onClick={() => setC({ ...c, exact_worlds: c.exact_worlds.filter((x) => x !== w) })} className={`${chip} bg-emerald-100 text-emerald-900`}>
                  {name(w)} <X className="h-3 w-3" />
                </button>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && setC({ ...c, exact_worlds: [...c.exact_worlds, e.target.value], adjacent_worlds: c.adjacent_worlds.filter((a) => a.slug !== e.target.value) })}
                className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">+ add</option>
                {worlds.filter((w) => !c.exact_worlds.includes(w.slug)).map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Also fine (a reasonable background)</p>
            <div className="flex flex-wrap gap-1.5">
              {c.adjacent_worlds.map((a) => (
                <button key={a.slug} type="button" title={a.why} onClick={() => setC({ ...c, adjacent_worlds: c.adjacent_worlds.filter((x) => x.slug !== a.slug) })} className={`${chip} bg-sky-100 text-sky-900`}>
                  {name(a.slug)} <X className="h-3 w-3" />
                </button>
              ))}
              <select
                value=""
                onChange={(e) => e.target.value && setC({ ...c, adjacent_worlds: [...c.adjacent_worlds, { slug: e.target.value, why: "Added by you" }] })}
                className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">+ add</option>
                {worlds.filter((w) => !c.exact_worlds.includes(w.slug) && !c.adjacent_worlds.some((a) => a.slug === w.slug)).map((w) => (
                  <option key={w.slug} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Sells to</p>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOMERS.map((x) => {
                const on = c.customer_types.includes(x);
                return (
                  <button key={x} type="button" onClick={() => setC({ ...c, customer_types: on ? c.customer_types.filter((y) => y !== x) : [...c.customer_types, x] })} className={`${chip} border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 text-slate-600"}`}>
                    {on && <Check className="h-3 w-3" />} {x}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Cities</p>
            <div className="flex flex-wrap gap-1.5">
              {CITY_CHOICES.map((x) => {
                const on = c.cities.includes(x);
                return (
                  <button key={x} type="button" onClick={() => setC({ ...c, cities: on ? c.cities.filter((y) => y !== x) : [...c.cities, x] })} className={`${chip} border ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 text-slate-600"}`}>
                    {on && <Check className="h-3 w-3" />} {x}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:w-2/3">
            <label className="text-slate-500">
              Experience from (yrs)
              <input value={num(c.exp_min)} onChange={(e) => setC({ ...c, exp_min: parse(e.target.value) })} inputMode="decimal" className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-slate-500">
              to (yrs)
              <input value={num(c.exp_max)} onChange={(e) => setC({ ...c, exp_max: parse(e.target.value) })} inputMode="decimal" className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <label className="text-slate-500">
              Budget up to (LPA)
              <input value={num(c.budget_max)} onChange={(e) => setC({ ...c, budget_max: parse(e.target.value) })} inputMode="decimal" className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900" />
            </label>
          </div>

          {error && <p className="text-rose-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-1.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-60">
              {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save and rank
            </button>
            <button type="button" onClick={rewrite} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-blue-600 hover:underline disabled:opacity-60">
              {busy === "rewrite" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Rewrite from the mandate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
