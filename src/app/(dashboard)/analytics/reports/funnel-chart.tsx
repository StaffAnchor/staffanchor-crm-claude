import Link from "next/link";

// A real narrowing-funnel visual (inspired by Ceipal's submission pipeline
// widget) rather than the horizontal bar list used in the Pipeline tab --
// this is the "at a glance, how much falls off at each stage" shape a
// homepage-style dashboard needs. The detailed bar list + conversion-rate
// math stays in the Pipeline & Conversion tab; this is deliberately just
// the shape, so it reads in under a second.
const BAND_COLORS = [
  "#2563eb", // blue-600
  "#4f46e5", // indigo-600
  "#0891b2", // cyan-600
  "#0d9488", // teal-600
  "#059669", // emerald-600
  "#65a30d", // lime-600
  "#ca8a04", // amber-600 (offer)
  "#16a34a", // green-600 (placed)
];

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  href: string;
};

export default function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      {stages.map((s, i) => {
        const widthPct = s.count > 0 ? Math.max((s.count / max) * 100, 14) : 14;
        return (
          <Link
            key={s.key}
            href={s.href}
            className="group flex items-center justify-center h-8 text-white text-[11px] font-semibold transition-all duration-200 ease-ros hover:opacity-90 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]"
            style={{
              width: `${widthPct}%`,
              minWidth: "30%",
              backgroundColor: BAND_COLORS[i % BAND_COLORS.length],
              clipPath: "polygon(3% 0, 97% 0, 100% 100%, 0% 100%)",
            }}
            title={`${s.label}: ${s.count}`}
          >
            <span className="truncate px-2 tabular-nums">
              {s.label} · {s.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
