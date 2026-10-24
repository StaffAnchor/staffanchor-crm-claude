// A small trend line with a soft area under it. Plain SVG, no chart library: it only has to show a shape.
export default function Sparkline({
  values,
  width = 120,
  height = 36,
  tone = "teal",
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "teal" | "amber" | "slate";
  label?: string;
}) {
  const stroke = tone === "amber" ? "var(--color-amber-500)" : tone === "slate" ? "var(--color-slate-400)" : "var(--color-teal-500)";
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(1, ...values);
  const pad = 3;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (n - 1);
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;
  const last = values[n - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label ?? "Trend"} className="overflow-visible">
      <path d={area} fill={stroke} opacity={0.12} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(last)} r={2.5} fill={stroke} />
    </svg>
  );
}
