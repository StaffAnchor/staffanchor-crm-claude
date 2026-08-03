import Link from "next/link";

// Execution-audit fix: recruiter conversion/placement numbers previously
// only lived inside Reports -> "Recruiter Performance", a tab a recruiter
// had to remember to click. Front-and-center now, right where they land
// every day. Deliberately compact -- full team ranking/comparison stays on
// the Reports page; this is just "how am I doing" at a glance.
export default function MyPerformanceCard({
  linked,
  submitted,
  interviewed,
  offered,
  placed,
}: {
  linked: number;
  submitted: number;
  interviewed: number;
  offered: number;
  placed: number;
}) {
  if (linked === 0) return null;

  const conversion = linked > 0 ? Math.round((placed / linked) * 100) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4 flex items-center gap-6 overflow-x-auto">
      <div className="shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">My performance</p>
        <p className="text-[11px] text-slate-400">All-time, across your linked candidates</p>
      </div>
      <div className="flex items-center gap-5 text-center">
        <div>
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{linked}</p>
          <p className="text-[10.5px] text-slate-400">Linked</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{submitted}</p>
          <p className="text-[10.5px] text-slate-400">Submitted</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-amber-700 tabular-nums">{interviewed}</p>
          <p className="text-[10.5px] text-slate-400">Interviewed</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-indigo-700 tabular-nums">{offered}</p>
          <p className="text-[10.5px] text-slate-400">Offered</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-emerald-700 tabular-nums">{placed}</p>
          <p className="text-[10.5px] text-slate-400">Placed</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{conversion}%</p>
          <p className="text-[10.5px] text-slate-400">Conversion</p>
        </div>
      </div>
      <Link href="/reports" className="ml-auto shrink-0 text-[12px] text-blue-600 hover:underline whitespace-nowrap">
        Full team report →
      </Link>
    </div>
  );
}
