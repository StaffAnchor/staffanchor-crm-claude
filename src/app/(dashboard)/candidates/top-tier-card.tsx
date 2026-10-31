import Link from "next/link";
import { Star } from "lucide-react";

// Top tier = strong sales people who can crack interviews: 3+ years, pay-to-experience ratio of 1.5 or more, communication
// rated good on a call, and open to work. This strip shows how many are there and who is closest, each one a list that opens in
// a new tab. The numbers come from the candidate_top_tier view, the same rule used on every profile.
export default function TopTierCard({
  topCount,
  askCount,
  callCount,
  noPayCount,
  active,
  hrefFor,
  founderCalls = false,
}: {
  topCount: number;
  askCount: number;
  callCount: number;
  noPayCount: number;
  active?: string;
  hrefFor: (top?: string) => string;
  founderCalls?: boolean;
}) {
  const pill = (isActive: boolean, strong: boolean) =>
    `inline-flex items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13px] transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
      isActive ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : strong ? "border-emerald-200 bg-white dark:border-emerald-900 dark:bg-slate-900" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`;
  const num = (n: number, tone: string) => <span className={`text-[18px] font-semibold tabular-nums leading-none ${n > 0 ? tone : "text-slate-400"}`}>{n.toLocaleString("en-IN")}</span>;
  return (
    <section aria-label="Top tier" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ros-lg border border-slate-200 bg-white px-4 py-3 shadow-ros-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900 dark:text-slate-100" title="Sales people with 3+ years, pay-to-experience ratio of 1.5 or more, good communication on a call, and open to work">
        <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Top tier
      </h2>
      <Link href={hrefFor("top")} target="_blank" rel="noopener noreferrer" className={pill(active === "top", topCount > 0)} title="All five tests passed">
        {num(topCount, "text-emerald-700 dark:text-emerald-300")}
        <span className="text-slate-600 dark:text-slate-300">top tier</span>
      </Link>
      <Link href={hrefFor("ask")} target="_blank" rel="noopener noreferrer" className={pill(active === "ask", false)} title="Pay, experience and communication are good. Confirm they are looking">
        {num(askCount, "text-teal-700 dark:text-teal-300")}
        <span className="text-slate-600 dark:text-slate-300">strong, confirm they are open</span>
      </Link>
      <Link href={hrefFor("call")} target="_blank" rel="noopener noreferrer" className={pill(active === "call", false)} title="Pay-to-experience ratio of 1.5 or more with 3+ years. Call them and rate how they come across">
        {num(callCount, "text-slate-800 dark:text-slate-100")}
        <span className="text-slate-600 dark:text-slate-300">worth a call</span>
      </Link>
      <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {active && (
          <Link href={hrefFor(undefined)} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-800 hover:underline">
            Clear filter
          </Link>
        )}
        {noPayCount > 0 && (
          <Link href="/candidates/complete" className="text-[12.5px] font-medium text-amber-700 hover:underline dark:text-amber-300" title="Experienced sales people with no current pay on file, so the ratio can't be worked out">
            {noPayCount.toLocaleString("en-IN")} need their pay filled in
          </Link>
        )}
        {founderCalls && (
          <Link href="/candidates/founder-calls" className="text-[12.5px] font-medium text-teal-700 hover:underline dark:text-teal-300" title="Your daily 4 senior profiles to speak to personally">
            Founder calls
          </Link>
        )}
      </span>
    </section>
  );
}
