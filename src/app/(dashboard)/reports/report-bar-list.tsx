import Link from "next/link";

export type BarItem = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export default function ReportBarList({
  items,
  colorClass = "bg-blue-500/80",
  emptyLabel = "No data yet.",
}: {
  items: BarItem[];
  colorClass?: string;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-slate-400">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const widthPct = item.count > 0 ? Math.max((item.count / max) * 100, 4) : 0;
        return (
          <Link
            key={item.key}
            href={item.href}
            className="group flex items-center gap-2.5"
            title={`${item.count} candidate${item.count === 1 ? "" : "s"} — click to view`}
          >
            <span className="w-[132px] shrink-0 truncate text-[11.5px] text-slate-600 group-hover:text-blue-600 transition-colors">
              {item.label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${colorClass} opacity-80 group-hover:opacity-100 transition-all duration-200`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="w-5 shrink-0 text-right text-[11.5px] font-semibold text-slate-700">
              {item.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
