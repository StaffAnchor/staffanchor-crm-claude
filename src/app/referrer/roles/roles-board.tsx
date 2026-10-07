"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import RoleCard from "@/components/sales-circle/role-card";
import { categoryLabel, locationText, type RoleCardData } from "@/lib/sales-circle";

type Sort = "newest" | "payout" | "ctc";

// Search, filter and sort over the roles the database already decided this
// referrer may see. Nothing here can reveal more than the role data it is given.
export default function RolesBoard({ roles }: { roles: RoleCardData[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [place, setPlace] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [now] = useState(() => Date.now());

  const categories = useMemo(() => Array.from(new Set(roles.map((r) => r.category).filter(Boolean) as string[])), [roles]);
  const places = useMemo(() => Array.from(new Set(roles.flatMap((r) => (r.cities?.length ? r.cities : r.city ? [r.city] : [])))).sort(), [roles]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = roles.filter((r) => {
      if (category && r.category !== category) return false;
      if (place && !(r.cities?.includes(place) || r.city === place)) return false;
      if (!q) return true;
      return [r.role_title, r.sub_domain, locationText(r), r.referral_summary, ...(r.must_haves ?? [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
    const num = (v: unknown) => (v == null ? -1 : Number(v));
    return [...list].sort((a, b) => {
      if (sort === "payout") return num(b.payout_amount) - num(a.payout_amount);
      if (sort === "ctc") return num(b.budget_max ?? b.budget_min) - num(a.budget_max ?? a.budget_min);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [roles, query, category, place, sort]);

  const select = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles, skills or city"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>
        {categories.length > 1 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={select} aria-label="Type of sales">
            <option value="">All sales types</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        )}
        {places.length > 1 && (
          <select value={place} onChange={(e) => setPlace(e.target.value)} className={select} aria-label="City">
            <option value="">All cities</option>
            {places.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select} aria-label="Sort">
          <option value="newest">Newest first</option>
          <option value="payout">Highest payout</option>
          <option value="ctc">Highest CTC</option>
        </select>
      </div>

      <p className="mt-3 text-[12px] text-slate-400">
        Showing {shown.length} of {roles.length} open role{roles.length === 1 ? "" : "s"}
      </p>

      {shown.length === 0 ? (
        <p className="mt-10 text-center text-[13px] text-slate-400">No roles match those filters.</p>
      ) : (
        <div className="mt-4 grid gap-4">
          {shown.map((r) => (
            <RoleCard key={r.id} role={r} isNew={now - new Date(r.created_at).getTime() < 7 * 86_400_000} />
          ))}
        </div>
      )}
    </div>
  );
}
