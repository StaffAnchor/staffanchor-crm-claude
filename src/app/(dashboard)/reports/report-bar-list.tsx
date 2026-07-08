import Link from "next/link";

export type BarItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  pct?: number;
};

export default function ReportBarList({
  items,
  colorClass = "bg-blue-500/80",
  emptyLabel = "No data yet.",
  highlightTop = false,
}: {
  items: BarItem[];
  colorClass?: string;
  emptyLabel?: string;
  highlightTop?: boolean;
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-slate-400">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const widthPct = item.count > 0 ? Math.max((item.count / max) * 100, 4) : 0;
        const isTop = highlightTop && idx === 0 && item.count > 0;
        return (
          <Link
            key={item.key}
            href={item.href}
            className="group flex items-center gap-2.5"
            title={`${item.count} candidate${item.count === 1 ? "" : "s"}${
              item.pct !== undefined ? ` · ${item.pct}% of total` : ""
            } — click to view`}
          >
            <span
              className={`w-[132px] shrink-0 truncate text-[11.5px] transition-colors ${
                isTop ? "font-semibold text-slate-800" : "text-slate-600"
              } group-hover:text-blue-600`}
            >
              {item.label}
            </span>
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${colorClass} transition-all duration-200 ${
                  isTop ? "opacity-100" : "opacity-70 group-hover:opacity-100"
                }`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="w-[52px] shrink-0 text-right text-[11.5px] tabular-nums">
              <span className="font-semibold text-slate-700">{item.count}</span>
              {item.pct !== undefined && <span className="text-slate-400 ml-1">{item.pct}%</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
