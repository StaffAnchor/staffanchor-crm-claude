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
  founderCalls = false,
}: {
  topCount: number;
  readySalesCount: number;
  active?: string;
  hrefFor: (top?: string) => string;
  founderCalls?: boolean;
}) {
  const unconfirmed = Math.max(0, readySalesCount - topCount);
  const pill = (isActive: boolean, strong: boolean) =>
    `inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
      isActive ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : strong ? "border-teal-200 bg-white dark:border-teal-900 dark:bg-slate-900" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`;
  return (
    <section aria-label="Top tier" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ros-lg border border-slate-200 bg-white px-4 py-3 shadow-ros-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100" title="Complete sales profiles. Start here for a new mandate.">
        <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Top tier
      </h2>
      <Link target="_blank" rel="noopener noreferrer" href={hrefFor("open")} className={pill(active === "open", topCount > 0)} title="Complete sales profiles confirmed open to work in the last 90 days">
        <span className={`text-[18px] font-semibold tabular-nums leading-none ${topCount > 0 ? "text-teal-700 dark:text-teal-300" : "text-slate-400"}`}>{topCount}</span>
        <span className="text-slate-600 dark:text-slate-300">open to work now</span>
      </Link>
      <Link target="_blank" rel="noopener noreferrer" href={hrefFor("ready")} className={pill(active === "ready", false)} title="Complete data, openness not confirmed yet">
        <span className="text-[18px] font-semibold tabular-nums leading-none text-slate-800 dark:text-slate-100">{readySalesCount}</span>
        <span className="text-slate-600 dark:text-slate-300">ready sales profiles</span>
      </Link>
      <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {active && (
          <Link href={hrefFor(undefined)} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800 hover:underline">
            Clear filter
          </Link>
        )}
        {founderCalls && (
          <Link href="/candidates/founder-calls" className="text-[12.5px] font-medium text-teal-700 hover:underline dark:text-teal-300" title="Your daily 4 senior profiles to speak to personally">
            Founder calls
          </Link>
        )}
        {unconfirmed > 0 && (
          <Link href="/candidates/outreach" className="rounded-full bg-teal-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700" title="They move into the top tier when they tap Yes, I'm open">
            Ask {unconfirmed} on WhatsApp
          </Link>
        )}
      </span>
    </section>
  );
}
