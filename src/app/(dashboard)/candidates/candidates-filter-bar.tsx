import Link from "next/link";

export type HeaderCounts = {
  total: number;
  mine: number;
  b2b_sales: number;
  b2c_sales: number;
  non_sales: number;
  unclear: number;
  incomplete: number;
  strong: number;
  weak: number;
  ready: number;
  almost: number;
  needs_work: number;
  review: number;
};

const fmt = (n: number) => n.toLocaleString("en-IN");

function Pill({
  href,
  active,
  count,
  tone = "slate",
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  tone?: "slate" | "blue" | "amber" | "emerald" | "rose";
  children: React.ReactNode;
}) {
  const on: Record<string, string> = {
    slate: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 ring-slate-900",
    blue: "bg-blue-600 text-white ring-blue-600",
    amber: "bg-amber-500 text-white ring-amber-500",
    emerald: "bg-emerald-600 text-white ring-emerald-600",
    rose: "bg-rose-600 text-white ring-rose-600",
  };
  const off: Record<string, string> = {
    slate: "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800",
    blue: "bg-white text-slate-700 ring-slate-200 hover:bg-blue-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
    amber: "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900",
    rose: "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900",
  };
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 transition-colors duration-150 ${active ? on[tone] : off[tone]}`}
    >
      {children}
      {count !== undefined && (
        <span className={`tabular-nums text-[11px] font-semibold ${active ? "opacity-90" : "opacity-60"}`}>{fmt(count)}</span>
      )}
    </Link>
  );
}

// The quick-filter bar at the top of the Candidates list. Every chip shows how many profiles it
// holds, read from the same database totals as the group tiles, so the numbers always agree.
export default function CandidatesFilterBar({
  counts,
  owner,
  group,
  incomplete,
  rating,
  ready,
  hrefFor,
}: {
  counts: HeaderCounts | null;
  owner?: string;
  group?: string;
  incomplete?: boolean;
  rating?: string;
  ready?: string;
  hrefFor: (overrides: Record<string, string | undefined>) => string;
}) {
  const c = counts;
  const types: { value: string; label: string; count?: number }[] = [
    { value: "", label: "All", count: c?.total },
    { value: "b2b_sales", label: "B2B Sales", count: c?.b2b_sales },
    { value: "b2c_sales", label: "B2C Sales", count: c?.b2c_sales },
    { value: "non_sales", label: "Non-Sales", count: c?.non_sales },
    { value: "unclear", label: "Not enough data", count: c?.unclear },
  ];
  const typeActive = (v: string) => (v === "" ? !group : group === v);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <Pill href={hrefFor({ owner: owner ? undefined : "me", page: undefined })} active={!!owner} count={c?.mine} tone="blue">
        {owner === "me" ? "★ My candidates" : owner ? "★ Filtered by owner" : "My candidates"}
      </Pill>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden />
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">Profile type</span>
      {types.map((t) => (
        <Pill key={t.value || "all"} href={hrefFor({ group: t.value || undefined, subgroup: undefined, category: undefined })} active={typeActive(t.value)} count={t.count} tone="slate">
          {t.label}
        </Pill>
      ))}

      <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden />
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400" title="How complete the profile is for a mandate: CTC, notice, CV read and so on">Readiness</span>
      <Pill href={hrefFor({ ready: ready === "ready" ? undefined : "ready", missing: undefined })} active={ready === "ready"} count={c?.ready} tone="emerald">
        Ready
      </Pill>
      <Pill href={hrefFor({ ready: ready === "almost" ? undefined : "almost", missing: undefined })} active={ready === "almost"} count={c?.almost} tone="amber">
        Almost there
      </Pill>
      <Pill href={hrefFor({ ready: ready === "needs_work" ? undefined : "needs_work", missing: undefined })} active={ready === "needs_work"} count={c?.needs_work} tone="rose">
        Needs work
      </Pill>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" aria-hidden />
      <Pill href={hrefFor({ incomplete: incomplete ? undefined : "1" })} active={!!incomplete} count={c?.incomplete} tone="amber">
        Haven&apos;t finished registering
      </Pill>
      <Pill href={hrefFor({ rating: rating === "strong" ? undefined : "strong" })} active={rating === "strong"} count={c?.strong} tone="emerald">
        ★ Rated strong
      </Pill>
      <Pill href={hrefFor({ rating: rating === "weak" ? undefined : "weak" })} active={rating === "weak"} count={c?.weak} tone="rose">
        ⚑ Rated weak
      </Pill>
    </div>
  );
}
