"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import WhatsAppMenu from "@/components/whatsapp-menu";
import PoolControl from "@/components/pool-control";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { POOL_TIERS, POOL_TIER_LABEL, type PoolEntry, type PoolTier } from "@/lib/talent-pool";
import { HUNTER_LABEL, segmentLabel, gapKeys, type PassportRow } from "@/lib/saas-passport";

export type PoolRow = PassportRow & { pool: PoolEntry; lastTouch: string | null; daysSinceTouch: number | null };

const COLD_DAYS = 60;

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-[96px]">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-[12.5px] ${value ? "text-slate-800 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"}`}>{value || "Not known"}</p>
    </div>
  );
}

const ctc = (r: PassportRow) => {
  const cur = r.current_fixed_ctc != null ? `${Number(r.current_fixed_ctc)} LPA` : null;
  const exp = r.expected_fixed_ctc != null ? `${Number(r.expected_fixed_ctc)} LPA` : null;
  return cur && exp ? `${cur} → ${exp}` : cur ?? (exp ? `Expects ${exp}` : null);
};

const TIER_ORDER: Record<PoolTier, number> = { top: 0, strong: 1, watch: 2 };

export default function PoolList({ rows }: { rows: PoolRow[] }) {
  const me = useMyFirstName();
  const [tier, setTier] = useState<PoolTier | "all" | "cold">("all");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<"tier" | "recent" | "cold">("tier");

  const cities = useMemo(() => Array.from(new Set(rows.map((r) => r.city).filter((c): c is string => !!c))).sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (tier === "cold") {
        if (r.daysSinceTouch != null && r.daysSinceTouch < COLD_DAYS) return false;
      } else if (tier !== "all" && r.pool.tier !== tier) return false;
      if (city && r.city !== city) return false;
      if (needle && ![r.full_name, r.current_employer, r.current_job_title, r.pool.reason, ...(r.pool.tags ?? [])].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === "recent") return (b.pool.marked_at ?? "").localeCompare(a.pool.marked_at ?? "");
      if (sort === "cold") return (b.daysSinceTouch ?? 9999) - (a.daysSinceTouch ?? 9999);
      return TIER_ORDER[a.pool.tier] - TIER_ORDER[b.pool.tier] || (b.passport_score ?? 0) - (a.passport_score ?? 0);
    });
  }, [rows, tier, q, city, sort]);

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[12.5px] font-medium ${on ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`;
  const count = (t: PoolTier) => rows.filter((r) => r.pool.tier === t).length;
  const coldCount = rows.filter((r) => r.daysSinceTouch == null || r.daysSinceTouch >= COLD_DAYS).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTier("all")} className={chip(tier === "all")}>
          All {rows.length}
        </button>
        {POOL_TIERS.map((t) => (
          <button key={t} type="button" onClick={() => setTier(t)} className={chip(tier === t)}>
            {POOL_TIER_LABEL[t]} {count(t)}
          </button>
        ))}
        <button type="button" onClick={() => setTier("cold")} className={chip(tier === "cold")} title={`No contact in ${COLD_DAYS}+ days, or never since being added`}>
          Going cold {coldCount}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, reason, tag" className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-[12.5px] dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] dark:border-slate-700 dark:bg-slate-900">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as "tier" | "recent" | "cold")} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12.5px] dark:border-slate-700 dark:bg-slate-900">
            <option value="tier">Best first</option>
            <option value="recent">Recently added</option>
            <option value="cold">Longest since contact</option>
          </select>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="rounded-ros-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">Your Talent Pool is empty</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] text-slate-500">
            After a good conversation, press <span className="font-semibold">Add to pool</span> on the bench or on the candidate&apos;s profile, choose a tier and say why. They will appear here.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {shown.map((r) => (
          <li key={r.candidate_id} className="rounded-ros-xl border border-slate-100 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{initials(r.full_name)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/candidates/${r.candidate_id}`} className="text-[14px] font-semibold text-slate-900 hover:text-blue-600 dark:text-slate-100">
                    {r.full_name ?? "Unnamed"}
                  </Link>
                  <PoolControl candidateId={r.candidate_id} entry={r.pool} compact />
                  {(r.daysSinceTouch == null || r.daysSinceTouch >= COLD_DAYS) && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:ring-sky-800">
                      {r.daysSinceTouch == null ? "Not contacted yet" : `${r.daysSinceTouch} days since contact`}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">
                  {[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                  {r.city ? ` · ${r.city}` : ""}
                  {r.total_experience_years != null ? ` · ${Number(r.total_experience_years)} yrs` : ""}
                </p>
                {r.pool.reason && <p className="mt-1.5 text-[12.5px] italic text-slate-700 dark:text-slate-200">&ldquo;{r.pool.reason}&rdquo;</p>}
                {(r.pool.tags ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.pool.tags.map((t) => (
                      <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] text-emerald-800 ring-1 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/60">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
                  <Fact label="Sells to" value={(r.segments ?? []).map(segmentLabel).join(", ") || null} />
                  <Fact label="Deal size" value={r.deal_size} />
                  <Fact label="Quota" value={r.quota} />
                  <Fact label="Style" value={r.hunter_farmer ? HUNTER_LABEL[r.hunter_farmer] : null} />
                  <Fact label="CTC" value={ctc(r)} />
                  <Fact label="Notice" value={r.notice_period} />
                </div>
                <p className="mt-2 text-[11.5px] text-slate-400">
                  Added{r.pool.marked_by_name ? ` by ${r.pool.marked_by_name}` : ""}
                  {r.pool.marked_at ? ` on ${new Date(r.pool.marked_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  {r.lastTouch ? ` · last contact ${r.lastTouch}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                <WhatsAppMenu
                  phone={r.phone}
                  templates={candidateTemplates(r.full_name, { me, candidateId: r.candidate_id, missing: gapKeys(r) }).filter((t) => t.key !== "intro")}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {rows.length > 0 && shown.length === 0 && <p className="text-[13px] text-slate-500">No one in the pool matches these filters.</p>}
    </div>
  );
}
