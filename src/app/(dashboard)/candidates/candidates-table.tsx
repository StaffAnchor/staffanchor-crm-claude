"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Settings2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  X,
} from "lucide-react";

export type CandidateRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  current_location: string | null;
  current_employer: string | null;
  current_job_title: string | null;
  category: string | null;
  sub_domain: string | null;
  total_experience_years: number | null;
  current_fixed_ctc: number | null;
  notice_period: string | null;
  status: string;
  recruiter_assessment: Record<string, unknown> | null;
  segment_data: Record<string, unknown> | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_input: "Awaiting Input",
  lead: "Lead",
  registered: "Registered",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  client_interview: "Client Interview",
  offer: "Offer",
  placed: "Placed",
  alumni: "Alumni",
  inactive: "Inactive",
};

const STATUS_STYLE: Record<string, string> = {
  awaiting_input: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  lead: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  registered: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  under_review: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  shortlisted: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
  submitted: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200",
  client_interview: "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200",
  offer: "bg-lime-50 text-lime-700 ring-1 ring-lime-200",
  placed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  alumni: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
  inactive: "bg-red-50 text-red-600 ring-1 ring-red-200",
};

const CATEGORY_COLOR: Record<string, string> = {
  b2b_sales: "from-blue-400 to-blue-600",
  b2c_sales: "from-fuchsia-400 to-fuchsia-600",
  non_sales: "from-slate-400 to-slate-600",
};

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
};

const RECOMMENDATION_STYLE: Record<string, string> = {
  "Strong Fit": "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  "Fit with Reservations": "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  "Not a Fit": "bg-red-50 text-red-600 ring-1 ring-red-200",
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function roleLevelFor(c: CandidateRow): string {
  const seg = c.segment_data ?? {};
  const level = seg["role_level"];
  const team = seg["team"];
  if (!level) return "—";
  const levelStr = String(level);
  if (typeof team === "number" && team > 0) return `${levelStr} · Team of ${team}`;
  return levelStr;
}

type ColumnDef = {
  key: string;
  label: string;
  render: (c: CandidateRow) => React.ReactNode;
  headerClassName?: string;
};

const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "created_at",
    label: "Profile Created",
    render: (c) => <span className="text-slate-600 whitespace-nowrap">{formatDate(c.created_at)}</span>,
  },
  {
    key: "email",
    label: "Email",
    render: (c) => <span className="text-slate-600 truncate block max-w-[180px]">{c.email}</span>,
  },
  {
    key: "phone",
    label: "Number",
    render: (c) => <span className="text-slate-600 whitespace-nowrap">{c.phone ?? "—"}</span>,
  },
  {
    key: "current_fixed_ctc",
    label: "Current Fixed CTC",
    render: (c) => (
      <span className="text-slate-600 tabular-nums whitespace-nowrap">
        {c.current_fixed_ctc ? `₹${c.current_fixed_ctc}L` : "—"}
      </span>
    ),
  },
  {
    key: "total_experience_years",
    label: "Total Experience",
    render: (c) => (
      <span className="text-slate-600 tabular-nums whitespace-nowrap">
        {c.total_experience_years ?? "—"} yrs
      </span>
    ),
  },
  {
    key: "current_job_title",
    label: "Current Title",
    render: (c) => <span className="text-slate-600 truncate block max-w-[160px]">{c.current_job_title ?? "—"}</span>,
  },
  {
    key: "current_employer",
    label: "Current Company",
    render: (c) => <span className="text-slate-600 truncate block max-w-[160px]">{c.current_employer ?? "—"}</span>,
  },
  {
    key: "category",
    label: "Major Domain",
    render: (c) => (
      <div>
        <span className="text-slate-700">{CATEGORY_LABEL[c.category ?? ""] ?? "—"}</span>
        {c.sub_domain && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{c.sub_domain}</div>}
      </div>
    ),
  },
  {
    key: "current_location",
    label: "Location",
    render: (c) => <span className="text-slate-600 whitespace-nowrap">{c.current_location ?? "—"}</span>,
  },
  {
    key: "role_level",
    label: "IC / Team Lead",
    render: (c) => <span className="text-slate-600 whitespace-nowrap">{roleLevelFor(c)}</span>,
  },
  {
    key: "recommendation",
    label: "Recruiter's Assessment",
    render: (c) => {
      const rec = (c.recruiter_assessment?.["overall_recommendation"] as string | undefined) ?? undefined;
      if (!rec) return <span className="text-[11px] text-slate-400">Not assessed</span>;
      return (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${RECOMMENDATION_STYLE[rec] ?? "bg-slate-100 text-slate-600"}`}>
          {rec}
        </span>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    render: (c) => (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${STATUS_STYLE[c.status] ?? "bg-slate-100 text-slate-700"}`}>
        {STATUS_LABEL[c.status] ?? c.status}
      </span>
    ),
  },
  {
    key: "sub_domain",
    label: "Sub-domain",
    render: (c) => <span className="text-slate-600 truncate block max-w-[160px]">{c.sub_domain ?? "—"}</span>,
  },
  {
    key: "notice_period",
    label: "Notice Period",
    render: (c) => <span className="text-slate-600 whitespace-nowrap">{c.notice_period ?? "—"}</span>,
  },
];

const COLUMN_KEYS = COLUMN_DEFS.map((c) => c.key);

const DEFAULT_VISIBLE = new Set([
  "created_at",
  "email",
  "phone",
  "current_fixed_ctc",
  "total_experience_years",
  "current_job_title",
  "current_employer",
  "category",
  "current_location",
  "role_level",
  "recommendation",
  "status",
]);

const STORAGE_KEY = "sa_candidates_columns_v1";

function loadPrefs(): { order: string[]; hidden: string[] } {
  const defaults = {
    order: COLUMN_KEYS,
    hidden: COLUMN_KEYS.filter((k) => !DEFAULT_VISIBLE.has(k)),
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as { order: string[]; hidden: string[] };
    // Guard against a stale saved list missing newly-added columns.
    const missing = COLUMN_KEYS.filter((k) => !parsed.order.includes(k));
    return { order: [...parsed.order.filter((k) => COLUMN_KEYS.includes(k)), ...missing], hidden: parsed.hidden ?? [] };
  } catch {
    return defaults;
  }
}

export default function CandidatesTable({ candidates }: { candidates: CandidateRow[] }) {
  const [order, setOrder] = useState<string[]>(COLUMN_KEYS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs();
    setOrder(prefs.order);
    setHidden(new Set(prefs.hidden));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden: Array.from(hidden) }));
  }, [order, hidden, ready]);

  const columnsByKey = useMemo(() => {
    const map = new Map<string, ColumnDef>();
    COLUMN_DEFS.forEach((c) => map.set(c.key, c));
    return map;
  }, []);

  const visibleColumns = order.filter((k) => !hidden.has(k)).map((k) => columnsByKey.get(k)!).filter(Boolean);

  function move(key: string, dir: -1 | 1) {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const swapWith = idx + dir;
      if (swapWith < 0 || swapWith >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      return next;
    });
  }

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetDefaults() {
    setOrder(COLUMN_KEYS);
    setHidden(new Set(COLUMN_KEYS.filter((k) => !DEFAULT_VISIBLE.has(k))));
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-visible shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 relative">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" /> Customize columns
        </button>

        {panelOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
            <div className="absolute right-4 top-11 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-semibold text-slate-800">Columns</p>
                <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                Show/hide and reorder — saved to this browser only.
              </p>
              <div className="max-h-80 overflow-y-auto space-y-0.5">
                {order.map((key, i) => {
                  const col = columnsByKey.get(key);
                  if (!col) return null;
                  const isHidden = hidden.has(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isHidden ? "opacity-40" : ""} hover:bg-slate-50`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggle(key)}
                        className="shrink-0"
                      />
                      <span className="text-[12px] text-slate-700 flex-1 truncate">{col.label}</span>
                      <button
                        onClick={() => move(key, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-800 disabled:opacity-20 shrink-0"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(key, 1)}
                        disabled={i === order.length - 1}
                        className="text-slate-400 hover:text-slate-800 disabled:opacity-20 shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={resetDefaults}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800 mt-2 pt-2 border-t border-slate-100 w-full"
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
              </button>
            </div>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/80 text-slate-400 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap">Name</th>
              {visibleColumns.map((col) => (
                <th key={col.key} className="text-left px-4 py-2.5 font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {candidates.map((c) => (
              <tr key={c.id} className="group hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/candidates/${c.id}`} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${
                        CATEGORY_COLOR[c.category ?? ""] ?? "from-slate-400 to-slate-500"
                      } flex items-center justify-center text-[11px] font-semibold text-white shrink-0`}
                    >
                      {initialsFor(c.full_name)}
                    </div>
                    <p className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors truncate whitespace-nowrap">
                      {c.full_name}
                    </p>
                  </Link>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(c)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/candidates/${c.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-[12px] text-blue-600 font-medium whitespace-nowrap"
                  >
                    View <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {candidates.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500">No candidates match these filters.</p>
          <Link href="/candidates" className="text-[13px] text-blue-600 hover:underline mt-1 inline-block">
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
