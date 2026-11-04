"use client";

import type { Fit } from "./fit";

export const INK = "text-slate-900";
export const LABEL = "font-mono text-[10.5px] uppercase tracking-[0.12em] text-slate-500";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatSlot(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function monthLabel(ym: string | null | undefined) {
  if (!ym) return "";
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  if (!m) return ym;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-IN", { month: "short", year: "numeric" });
}

export const lakhLabel = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `₹${Number.isInteger(n) ? n : n.toFixed(1)}L`;
};

const TONE: Record<Fit["tone"], { ring: string; text: string; word: string }> = {
  strong: { ring: "#059669", text: "text-emerald-700", word: "Strong match" },
  good: { ring: "#4f46e5", text: "text-indigo-700", word: "Good match" },
  mixed: { ring: "#d97706", text: "text-amber-700", word: "Partial match" },
  weak: { ring: "#94a3b8", text: "text-slate-600", word: "Weak match" },
  none: { ring: "#cbd5e1", text: "text-slate-500", word: "Not enough data" },
};

export function FitRing({ fit, size = 52 }: { fit: Fit; size?: number }) {
  const t = TONE[fit.tone];
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = fit.pct ?? 0;
  return (
    <div className="flex flex-col items-center" title={fit.pct === null ? "Not enough information to score this yet" : `${fit.points} of ${fit.total} things you asked for are met`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece7de" strokeWidth={5} />
          {fit.pct !== null && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.ring} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
          )}
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-mono text-[13px] font-semibold ${t.text}`}>
          {fit.pct === null ? "—" : `${fit.pct}`}
        </span>
      </div>
      <span className={`mt-1 text-[10px] font-medium ${t.text}`}>{fit.pct === null ? "Fit n/a" : "fit"}</span>
    </div>
  );
}

export function fitWord(fit: Fit) {
  return TONE[fit.tone].word;
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "info" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : tone === "warn"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : tone === "info"
          ? "bg-indigo-50 text-indigo-700 border-indigo-100"
          : "bg-[#f4efe6] text-slate-600 border-[#ece7de]";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
