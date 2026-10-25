import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { MISSING_LABEL, TIER_BAR, TIER_BLURB, TIER_LABEL, type ReadinessOverview, type ReadinessTier } from "@/lib/readiness";

const TIERS: ReadinessTier[] = ["ready", "almost", "needs_work"];

// How much of the talent pool can go into a mandate today, and what to fix next to move the most
// profiles. Every number is a link into the list.
export default function ReadinessStrip({
  overview,
  activeTier,
  activeMissing,
  hrefFor,
}: {
  overview: ReadinessOverview;
  activeTier?: string;
  activeMissing?: string;
  hrefFor: (tier?: string, missing?: string) => string;
}) {
  const total = Math.max(1, overview.total);
  const n = (t: ReadinessTier) => overview.tiers[t] ?? 0;
  const fixNext = Object.entries(overview.missing)
    .filter(([k]) => MISSING_LABEL[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const readyPct = Math.round((n("ready") / total) * 100);

  return (
    <section aria-label="Data readiness" className="mb-3 rounded-ros-lg border border-slate-100 bg-white p-4 shadow-ros-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> How ready is your talent pool for a mandate?
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            {readyPct}% of profiles are ready to shortlist today (average score {overview.avg}/100). Fix the details below to move the most profiles up.
          </p>
        </div>
        {(activeTier || activeMissing) && (
          <Link href={hrefFor(undefined, undefined)} className="text-[12px] font-medium text-teal-600 hover:underline">
            Clear readiness filter
          </Link>
        )}
      </div>

      <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Share of profiles by readiness">
        {TIERS.map((t) => (n(t) > 0 ? <div key={t} className={TIER_BAR[t]} style={{ width: `${(n(t) / total) * 100}%` }} title={`${TIER_LABEL[t]}: ${n(t)}`} /> : null))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TIERS.map((t) => (
          <Link target="_blank" rel="noopener noreferrer"
            key={t}
            href={hrefFor(t, undefined)}
            className={`rounded-lg border px-3 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeTier === t ? "border-slate-400 bg-slate-50 dark:border-slate-500 dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <span className={`h-2 w-2 rounded-full ${TIER_BAR[t]}`} /> {TIER_LABEL[t]}
            </div>
            <div className="mt-0.5 flex items-baseline justify-between">
              <span className="text-[22px] font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">{n(t)}</span>
              <span className="text-xs text-slate-400">{TIER_BLURB[t]}</span>
            </div>
          </Link>
        ))}
      </div>

      {fixNext.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Fix next: profiles missing</p>
          <div className="flex flex-wrap gap-1.5">
            {fixNext.map(([k, c]) => (
              <Link target="_blank" rel="noopener noreferrer"
                key={k}
                href={hrefFor(undefined, k)}
                className={`rounded-full px-2.5 py-1 text-xs ring-1 transition hover:bg-slate-50 dark:hover:bg-slate-800 ${activeMissing === k ? "bg-slate-100 font-semibold text-slate-900 ring-slate-400 dark:bg-slate-800 dark:text-slate-100" : "text-slate-600 ring-slate-200 dark:text-slate-300 dark:ring-slate-700"}`}
              >
                {MISSING_LABEL[k]} <span className="tabular-nums text-slate-400">· {c}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
