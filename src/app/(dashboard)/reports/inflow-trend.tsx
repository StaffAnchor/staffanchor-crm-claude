import Link from "next/link";

export type InflowPoint = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export default function InflowTrend({ points }: { points: InflowPoint[] }) {
  if (points.length === 0) {
    return <p className="text-[13px] text-slate-400">No candidates registered in this window.</p>;
  }
  const max = Math.max(1, ...points.map((p) => p.count));
  const dense = points.length > 20;

  return (
    <div className="flex items-end gap-1 h-32">
      {points.map((p) => {
        const heightPct = p.count > 0 ? Math.max((p.count / max) * 100, 6) : 2;
        return (
          <Link
            key={p.key}
            href={p.href}
            className="group flex-1 flex flex-col items-center justify-end h-full min-w-0"
            title={`${p.count} candidate${p.count === 1 ? "" : "s"} · ${p.label}`}
          >
            {!dense && (
              <span className="text-[10px] font-semibold text-slate-600 mb-1 tabular-nums">{p.count}</span>
            )}
            <div className="w-full rounded-t-sm bg-slate-100 overflow-hidden flex items-end" style={{ height: "100%" }}>
              <div
                className="w-full rounded-t-sm bg-indigo-500/80 group-hover:bg-indigo-500 transition-colors duration-200 ease-ros"
                style={{ height: `${heightPct}%` }}
              />
            </div>
            {!dense && (
              <span className="text-[9.5px] text-slate-400 mt-1 truncate w-full text-center">{p.label}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
