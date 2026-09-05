import Link from "next/link";

// Execution-audit fix: recruiter conversion/placement numbers previously
// only lived inside Reports -> "Recruiter Performance", a tab a recruiter
// had to remember to click. Front-and-center now, right where they land
// every day. Split into the two things a recruiter is actually asked to do
// day to day -- work mandates, and build/maintain pipeline -- rather than
// only ever showing mandate conversion, which used to make "no mandate"
// days look like zero output even when a recruiter spent the day sourcing.
export default function MyPerformanceCard({
  linked,
  submitted,
  interviewed,
  offered,
  placed,
  candidatesAddedWeek,
  candidatesAddedTotal,
  profilesCompleted,
}: {
  linked: number;
  submitted: number;
  interviewed: number;
  offered: number;
  placed: number;
  candidatesAddedWeek: number;
  candidatesAddedTotal: number;
  profilesCompleted: number;
}) {
  if (linked === 0 && candidatesAddedTotal === 0) return null;

  const conversion = linked > 0 ? Math.round((placed / linked) * 100) : 0;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-xl p-5 mb-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">My performance</p>
        <Link href="/reports" className="text-[12px] text-blue-600 hover:underline whitespace-nowrap">
          Full team report →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
        <div>
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{candidatesAddedWeek}</p>
          <p className="text-[10.5px] text-slate-400">Added this week</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{candidatesAddedTotal}</p>
          <p className="text-[10.5px] text-slate-400">Added all-time</p>
        </div>
        <div>
          <p className="text-[18px] font-semibold text-teal-700 tabular-nums">{profilesCompleted}</p>
          <p className="text-[10.5px] text-slate-400">Profiles completed</p>
        </div>
        <div className="border-l border-slate-100 dark:border-slate-800 pl-4">
          <p className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{linked}</p>
          <p className="text-[10.5px] text-slate-400">Linked to mandates</p>
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
          <p className="text-[10.5px] text-slate-400">
            Placed <span className="text-slate-300">· {conversion}%</span>
          </p>
        </div>
      </div>
    </div>
  );
}
