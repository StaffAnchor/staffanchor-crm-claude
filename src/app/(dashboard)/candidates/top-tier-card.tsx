import Link from "next/link";
import { Star } from "lucide-react";

// The shortlist to reach for first: complete profiles (Ready) in sales who
// have said they are open to work recently. "Ready" alone only means the data
// is complete, so the confirmed-open number is what makes this a top tier.
export default function TopTierCard({
  topCount,
  readySalesCount,
  active,
  hrefFor,
}: {
  topCount: number;
  readySalesCount: number;
  active?: string;
  hrefFor: (top?: string) => string;
}) {
  const unconfirmed = Math.max(0, readySalesCount - topCount);
  return (
    <section aria-label="Top tier" className="mb-3 rounded-ros-lg border border-amber-200 bg-amber-50/60 p-4 shadow-ros-sm dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Top tier
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Sales profiles that are complete and confirmed open to work in the last 90 days. Start here for a new mandate.
          </p>
        </div>
        {active && (
          <Link href={hrefFor(undefined)} className="text-[12px] font-medium text-teal-600 hover:underline">
            Clear top tier filter
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Link
          href={hrefFor("open")}
          className={`rounded-lg border bg-white px-3 py-2 transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${active === "open" ? "border-amber-400" : "border-slate-200 dark:border-slate-700"}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ready and open to work</div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-[22px] font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">{topCount}</span>
            <span className="text-xs text-slate-400">most recently confirmed first</span>
          </div>
        </Link>
        <Link
          href={hrefFor("ready")}
          className={`rounded-lg border bg-white px-3 py-2 transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 ${active === "ready" ? "border-amber-400" : "border-slate-200 dark:border-slate-700"}`}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">All ready sales profiles</div>
          <div className="mt-0.5 flex items-baseline justify-between">
            <span className="text-[22px] font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">{readySalesCount}</span>
            <span className="text-xs text-slate-400">complete data, openness unconfirmed</span>
          </div>
        </Link>
      </div>
      {unconfirmed > 0 && (
        <p className="mt-2 text-[12px] text-slate-600 dark:text-slate-300">
          {unconfirmed} ready sales profiles haven&apos;t confirmed they&apos;re open yet.{" "}
          <Link href="/candidates/outreach" className="font-medium text-teal-600 hover:underline">
            Ask them on WhatsApp
          </Link>{" "}
          and they move into the top tier when they tap &quot;Yes, I&apos;m open&quot;.
        </p>
      )}
    </section>
  );
}
