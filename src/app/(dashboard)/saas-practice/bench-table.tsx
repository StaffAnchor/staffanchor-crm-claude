"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TIER_LABEL, TIER_PILL, type ReadinessTier } from "@/lib/readiness";
import { FIT_LABEL, HUNTER_LABEL, passportTone, segmentLabel, type PassportRow } from "@/lib/saas-passport";

const PAGE = 60;

type Row = PassportRow & { strongRoles: string[] };

export default function BenchTable({ rows, segmentOptions }: { rows: Row[]; segmentOptions: string[] }) {
  const [q, setQ] = useState("");
  const [fit, setFit] = useState("all");
  const [segment, setSegment] = useState("all");
  const [hunter, setHunter] = useState("all");
  const [tier, setTier] = useState("all");
  const [missing, setMissing] = useState("all");
  const [matchOnly, setMatchOnly] = useState(false);
  const [sort, setSort] = useState<"passport" | "experience" | "readiness">("passport");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (fit !== "all" && r.practice_fit !== fit) return false;
      if (segment !== "all" && !(r.segments ?? []).includes(segment)) return false;
      if (hunter !== "all" && r.hunter_farmer !== hunter) return false;
      if (tier !== "all" && r.readiness_tier !== tier) return false;
      if (missing !== "all" && !(r.passport_missing ?? []).includes(missing)) return false;
      if (matchOnly && r.strongRoles.length === 0) return false;
      if (needle) {
        const hay = `${r.full_name ?? ""} ${r.current_employer ?? ""} ${r.current_job_title ?? ""} ${r.city ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === "experience") return Number(b.total_experience_years ?? 0) - Number(a.total_experience_years ?? 0);
      if (sort === "readiness") return (b.readiness_score ?? 0) - (a.readiness_score ?? 0);
      return b.passport_score - a.passport_score;
    });
    return out;
  }, [rows, q, fit, segment, hunter, tier, missing, matchOnly, sort]);

  const select = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Name, company, city"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2 py-1.5 text-[12.5px] w-52"
          />
        </div>
        <select value={fit} onChange={(e) => setFit(e.target.value)} className={select}>
          <option value="all">SaaS and tech</option>
          <option value="saas">SaaS only</option>
          <option value="tech">Other tech only</option>
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className={select}>
          <option value="all">Any segment sold to</option>
          {segmentOptions.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </select>
        <select value={hunter} onChange={(e) => setHunter(e.target.value)} className={select}>
          <option value="all">Hunter or farmer</option>
          <option value="hunter">Hunter</option>
          <option value="farmer">Farmer</option>
          <option value="both">Both</option>
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} className={select}>
          <option value="all">Any readiness</option>
          <option value="ready">Ready to shortlist</option>
          <option value="almost">Almost there</option>
          <option value="needs_work">Needs work</option>
        </select>
        <select value={missing} onChange={(e) => setMissing(e.target.value)} className={select}>
          <option value="all">Passport gaps: any</option>
          {["segment", "deal size", "quota / attainment", "sales cycle", "hunter or farmer", "role type"].map((m) => (
            <option key={m} value={m}>
              Missing {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
          Strong match for an open role
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${select} ml-auto`}>
          <option value="passport">Sort: passport complete</option>
          <option value="readiness">Sort: readiness</option>
          <option value="experience">Sort: experience</option>
        </select>
      </div>

      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
        {filtered.length} of {rows.length} candidates
      </p>

      <div className="overflow-x-auto rounded-ros-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="px-3 py-2.5 font-medium">Candidate</th>
              <th className="px-3 py-2.5 font-medium">Sells to</th>
              <th className="px-3 py-2.5 font-medium">Deal size</th>
              <th className="px-3 py-2.5 font-medium">Quota</th>
              <th className="px-3 py-2.5 font-medium">Style</th>
              <th className="px-3 py-2.5 font-medium">Notice</th>
              <th className="px-3 py-2.5 font-medium">Readiness</th>
              <th className="px-3 py-2.5 font-medium">Passport</th>
              <th className="px-3 py-2.5 font-medium">Strong match for</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, shown).map((r) => (
              <tr key={r.candidate_id} className="border-b border-slate-50 dark:border-slate-800/60 last:border-0 align-top">
                <td className="px-3 py-2.5">
                  <Link href={`/candidates/${r.candidate_id}`} className="font-medium text-blue-600 hover:underline">
                    {r.full_name ?? "Unnamed"}
                  </Link>
                  <p className="text-[12px] text-slate-500">
                    {[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "—"}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.practice_fit ? ` · ${FIT_LABEL[r.practice_fit]}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2.5">{(r.segments ?? []).map(segmentLabel).join(", ") || <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5">{r.deal_size ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5">{r.quota ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5">{r.hunter_farmer ? HUNTER_LABEL[r.hunter_farmer] : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5">{r.notice_period ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5">
                  {r.readiness_tier ? (
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] ring-1 ${TIER_PILL[r.readiness_tier as ReadinessTier]}`}>
                      {TIER_LABEL[r.readiness_tier as ReadinessTier]}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Badge tone={passportTone(r.passport_score)}>{r.passport_score}%</Badge>
                </td>
                <td className="px-3 py-2.5 text-[12.5px]">{r.strongRoles.length ? r.strongRoles.join(", ") : <span className="text-slate-400">—</span>}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  Nobody matches these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12.5px] hover:bg-slate-50 dark:hover:bg-slate-800">
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}
    </div>
  );
}
