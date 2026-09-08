import Link from "next/link";

// Plain SVG donut -- no chart library in this project (every existing chart
// on this page is hand-rolled divs/SVG), built via the standard
// stroke-dasharray-per-segment technique so it needs zero client JS and
// renders fine from a server component. Inspired by the pie chart on
// Ceipal's home dashboard; used here for "candidate mix" style breakdowns
// where a handful of categories sum to 100%.
const SLICE_COLORS = [
  "#2563eb", // blue-600
  "#0d9488", // teal-600
  "#7c3aed", // violet-600
  "#ea580c", // orange-600
  "#0891b2", // cyan-600
  "#ca8a04", // amber-600
  "#db2777", // pink-600
  "#65a30d", // lime-600
];

export type DonutSlice = {
  key: string;
  label: string;
  count: number;
  pct?: number;
  href: string;
};

export default function DonutChart({ slices, totalLabel = "total" }: { slices: DonutSlice[]; totalLabel?: string }) {
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) {
    return <p className="text-[13px] text-slate-400">No data yet.</p>;
  }
  const RADIUS = 54;
  const STROKE = 24;
  const CIRC = 2 * Math.PI * RADIUS;
  let cumulative = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0 -rotate-90">
        <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth={STROKE} />
        {slices.map((s, i) => {
          const fraction = s.count / total;
          const dash = fraction * CIRC;
          const offset = -cumulative;
          cumulative += dash;
          if (s.count === 0) return null;
          return (
            <circle
              key={s.key}
              cx={70}
              cy={70}
              r={RADIUS}
              fill="none"
              stroke={SLICE_COLORS[i % SLICE_COLORS.length]}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${CIRC - dash}`}
              strokeDashoffset={offset}
              className="transition-all duration-300 ease-ros hover:opacity-80"
            >
              <title>{`${s.label}: ${s.count} (${s.pct}%)`}</title>
            </circle>
          );
        })}
        <text x={70} y={70} textAnchor="middle" dominantBaseline="middle" transform="rotate(90 70 70)" className="fill-slate-900 dark:fill-slate-100 text-[22px] font-semibold">
          {total}
        </text>
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5">
        {slices.map((s, i) => (
          <Link key={s.key} href={s.href} className="group flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }} />
            <span className="truncate text-slate-600 dark:text-slate-400 group-hover:text-blue-600 transition-colors duration-200 ease-ros">{s.label}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{s.count}</span>
            <span className="shrink-0 tabular-nums text-slate-400 w-9 text-right">{s.pct ?? Math.round((s.count / total) * 100)}%</span>
          </Link>
        ))}
        <p className="text-[10.5px] text-slate-400 pt-0.5">{total} {totalLabel}</p>
      </div>
    </div>
  );
}
