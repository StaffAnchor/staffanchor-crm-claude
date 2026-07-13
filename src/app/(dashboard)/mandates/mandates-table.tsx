"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Settings2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  X,
  Trash2,
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";
import type { MandateSummary } from "./mandates-grid";

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "info",
  open: "success",
  on_hold: "warning",
  closed: "neutral",
  filled: "accent",
};

const STATUS_OPTIONS = ["draft", "open", "on_hold", "closed", "filled"];

type ColumnDef = {
  key: string;
  label: string;
  render: (m: MandateSummary) => React.ReactNode;
};

// Dense-table redesign: same underlying MandateSummary data the card grid
// used (client, category, city, status, linked/submitted counts, health
// signals, AI top match) -- just presented Zoho-Recruit-style, one row per
// mandate, with the same customize/select/bulk mechanics already proven on
// the Candidates table (see candidates-table.tsx, which this mirrors).
const COLUMN_DEFS: ColumnDef[] = [
  {
    key: "client_name",
    label: "Client",
    render: (m) => <span className="text-slate-700 dark:text-slate-300 truncate block max-w-[160px]">{m.client_name}</span>,
  },
  {
    key: "staffNames",
    label: "Recruiter",
    // Internal-only tracking field -- everyone staffed on this mandate.
    // Never sent to any client- or candidate-facing view.
    render: (m) =>
      m.staffNames.length > 0 ? (
        <span className="text-slate-700 dark:text-slate-300 truncate block max-w-[160px]" title={m.staffNames.join(", ")}>
          {m.staffNames.join(", ")}
        </span>
      ) : (
        <span className="text-[11px] text-amber-600">Unassigned</span>
      ),
  },
  {
    key: "category",
    label: "Function / Domain",
    render: (m) => (
      <div>
        <span className="text-slate-700 dark:text-slate-300 capitalize">{(m.category ?? "—").replace("_", " ")}</span>
        {m.sub_domain && <div className="text-[11px] text-slate-400 truncate max-w-[140px]">{m.sub_domain}</div>}
      </div>
    ),
  },
  {
    key: "city",
    label: "City",
    render: (m) => <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.city ?? "—"}</span>,
  },
  {
    key: "status",
    label: "Status",
    render: (m) => (
      <Badge tone={STATUS_TONE[m.status] ?? "neutral"} size="sm" className="normal-case tracking-normal">
        {m.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "linked",
    label: "Applications",
    render: (m) =>
      m.linked === 0 ? (
        <span className="text-slate-400 tabular-nums">0</span>
      ) : (
        <Link
          href={`/candidates?mandate=${m.id}`}
          className="text-blue-700 dark:text-blue-400 hover:underline tabular-nums font-medium"
          title={`View ${m.linked} candidate${m.linked === 1 ? "" : "s"} linked to this mandate`}
        >
          {m.linked}
        </Link>
      ),
  },
  {
    key: "submitted",
    label: "Submitted+",
    render: (m) => <span className="text-slate-600 dark:text-slate-300 tabular-nums">{m.submitted}</span>,
  },
  {
    key: "daysOpen",
    label: "Days Open",
    render: (m) => <span className="text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">{m.daysOpen}d</span>,
  },
  {
    key: "created_at",
    label: "Created",
    render: (m) => (
      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {new Date(m.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
      </span>
    ),
  },
  {
    key: "signals",
    label: "Health",
    render: (m) =>
      m.signals.length === 0 ? (
        <span className="text-[11px] text-slate-300">—</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {m.signals.map((s) => (
            <Badge key={s.label} tone={s.tone} size="sm" icon={<AlertTriangle className="w-2.5 h-2.5" />} className="normal-case tracking-normal">
              {s.label}
            </Badge>
          ))}
        </div>
      ),
  },
  {
    key: "topMatch",
    label: "Top AI Match",
    render: (m) =>
      !m.topMatch ? (
        <span className="text-[11px] text-slate-300">—</span>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
          <span className="truncate max-w-[110px] text-slate-700 dark:text-slate-300">{m.topMatch.name}</span>
          <Badge tone="accent" size="sm" className="normal-case tracking-normal shrink-0">
            {m.topMatch.score}%
          </Badge>
        </div>
      ),
  },
];

const COLUMN_KEYS = COLUMN_DEFS.map((c) => c.key);
const DEFAULT_VISIBLE = new Set([
  "client_name",
  "staffNames",
  "category",
  "city",
  "status",
  "linked",
  "submitted",
  "daysOpen",
  "signals",
]);

const STORAGE_KEY = "sa_mandates_columns_v1";

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
    const missing = COLUMN_KEYS.filter((k) => !parsed.order.includes(k));
    return { order: [...parsed.order.filter((k) => COLUMN_KEYS.includes(k)), ...missing], hidden: parsed.hidden ?? [] };
  } catch {
    return defaults;
  }
}

export default function MandatesTable({
  mandates,
  totalCount,
}: {
  mandates: MandateSummary[];
  totalCount?: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [order, setOrder] = useState<string[]>(COLUMN_KEYS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [chosenStatus, setChosenStatus] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const PAGE_SIZE = 10;

  // Reset to page 1 whenever the underlying filtered set changes (a sidebar
  // filter click, a status-tile click, etc.) so page 3 of a 40-row view
  // doesn't silently show as an empty page 3 of a 4-row view.
  useEffect(() => {
    setPageNum(1);
  }, [mandates]);

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

  const totalPages = Math.max(1, Math.ceil(mandates.length / PAGE_SIZE));
  const safePageNum = Math.min(pageNum, totalPages);
  const rangeStart = mandates.length === 0 ? 0 : (safePageNum - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePageNum * PAGE_SIZE, mandates.length);
  const pagedMandates = mandates.slice((safePageNum - 1) * PAGE_SIZE, safePageNum * PAGE_SIZE);

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

  function reorderTo(draggedKeyValue: string, targetKey: string) {
    if (draggedKeyValue === targetKey) return;
    setOrder((prev) => {
      const next = prev.filter((k) => k !== draggedKeyValue);
      const targetIdx = next.indexOf(targetKey);
      next.splice(targetIdx, 0, draggedKeyValue);
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

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    // Selects/clears only the rows on the currently visible page -- matches
    // how a paginated table reads: "select all" means "all of what I can
    // see right now," not every mandate across every page.
    setSelected((prev) =>
      pagedMandates.every((m) => prev.has(m.id)) && pagedMandates.length > 0
        ? new Set()
        : new Set(pagedMandates.map((m) => m.id))
    );
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkMessage(null);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    const confirmed = window.confirm(
      `Delete ${selected.size} mandate${selected.size === 1 ? "" : "s"}? This removes all candidate links, shortlist links, and assignments for each. This cannot be undone.`
    );
    if (!confirmed) return;
    setBulkBusy(true);
    const { error } = await supabase.from("mandates").delete().in("id", Array.from(selected));
    setBulkBusy(false);
    if (error) {
      setBulkMessage(`Delete failed: ${error.message}`);
      return;
    }
    setBulkMessage(`Deleted ${selected.size} mandate${selected.size === 1 ? "" : "s"}.`);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkStatus() {
    if (selected.size === 0 || !chosenStatus) return;
    setBulkBusy(true);
    const { error } = await supabase
      .from("mandates")
      .update({ status: chosenStatus })
      .in("id", Array.from(selected));
    setBulkBusy(false);
    setStatusModalOpen(false);
    if (error) {
      setBulkMessage(`Status update failed: ${error.message}`);
      return;
    }
    setBulkMessage(`Set ${selected.size} mandate${selected.size === 1 ? "" : "s"} to "${chosenStatus.replace("_", " ")}".`);
    setSelected(new Set());
    setChosenStatus("");
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-ros-lg overflow-visible shadow-ros-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 relative">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          {mandates.length === 0
            ? "0 mandates"
            : `Showing ${rangeStart}–${rangeEnd} of ${typeof totalCount === "number" ? totalCount : mandates.length} mandate${
                (typeof totalCount === "number" ? totalCount : mandates.length) === 1 ? "" : "s"
              }`}
        </p>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" /> Customize columns
        </button>

        {panelOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
            <div className="absolute right-4 top-11 z-50 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">Columns</p>
                <button onClick={() => setPanelOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">Show/hide and reorder — saved to this browser only.</p>
              <div className="max-h-80 overflow-y-auto space-y-0.5">
                {order.map((key, i) => {
                  const col = columnsByKey.get(key);
                  if (!col) return null;
                  const isHidden = hidden.has(key);
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={() => setDraggedKey(key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedKey) reorderTo(draggedKey, key);
                        setDraggedKey(null);
                      }}
                      onDragEnd={() => setDraggedKey(null)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing ${
                        isHidden ? "opacity-40" : ""
                      } ${draggedKey === key ? "opacity-30" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50`}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input type="checkbox" checked={!isHidden} onChange={() => toggle(key)} className="shrink-0" />
                      <span className="text-[12px] text-slate-700 dark:text-slate-300 flex-1 truncate">{col.label}</span>
                      <button
                        onClick={() => move(key, -1)}
                        disabled={i === 0}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-20 shrink-0"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => move(key, 1)}
                        disabled={i === order.length - 1}
                        className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 disabled:opacity-20 shrink-0"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={resetDefaults}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 w-full"
              >
                <RotateCcw className="w-3 h-3" /> Reset to default
              </button>
            </div>
          </>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
          <p className="text-[12px] font-semibold text-blue-800">{selected.size} selected</p>
          <Button variant="secondary" size="sm" onClick={() => setStatusModalOpen(true)} disabled={bulkBusy}>
            Set status
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkBusy}
            icon={bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            className="!bg-white dark:bg-slate-900 !text-red-600 ring-1 ring-red-200 hover:!bg-red-50"
          >
            Delete
          </Button>
          <button onClick={clearSelection} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 ml-auto">
            Clear selection
          </button>
        </div>
      )}

      {bulkMessage && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">{bulkMessage}</p>
        </div>
      )}

      {statusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setStatusModalOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Set status for {selected.size} mandate{selected.size === 1 ? "" : "s"}
            </h3>
            <select
              value={chosenStatus}
              onChange={(e) => setChosenStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] mb-3 mt-3"
            >
              <option value="">Select a status...</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusModalOpen(false)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[13px] font-medium py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkStatus}
                disabled={!chosenStatus || bulkBusy}
                className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium py-2 disabled:opacity-50"
              >
                {bulkBusy ? "Updating..." : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-auto max-h-[calc(100vh-13rem)]">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50/80 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 w-8 sticky left-0 top-0 z-30 bg-slate-50 dark:bg-slate-800/50">
                <input
                  type="checkbox"
                  checked={pagedMandates.length > 0 && pagedMandates.every((m) => selected.has(m.id))}
                  onChange={toggleAll}
                  className="rounded accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
                />
              </th>
              <th className="text-left px-4 py-2.5 font-semibold whitespace-nowrap sticky left-[52px] top-0 z-30 bg-slate-50 dark:bg-slate-800/50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                Posting Title
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className="text-left px-4 py-2.5 font-semibold whitespace-nowrap sticky top-0 z-20 bg-slate-50 dark:bg-slate-800/50">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagedMandates.map((m) => (
              <tr
                key={m.id}
                className={`group hover:bg-slate-50/70 dark:hover:bg-slate-800/70 transition-all duration-200 ease-ros ${
                  selected.has(m.id) ? "bg-blue-50/50 ring-1 ring-inset ring-blue-500/20" : ""
                }`}
              >
                <td className={`px-4 py-3 sticky left-0 z-10 ${selected.has(m.id) ? "bg-blue-50/50" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50/70 dark:group-hover:bg-slate-800/70"}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggleRow(m.id)}
                    className="rounded accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-shadow duration-200 ease-ros"
                  />
                </td>
                <td
                  className={`px-4 py-3 sticky left-[52px] z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] ${
                    selected.has(m.id) ? "bg-blue-50/50" : "bg-white dark:bg-slate-900 group-hover:bg-slate-50/70 dark:group-hover:bg-slate-800/70"
                  }`}
                >
                  <Link href={`/mandates/${m.id}`} className="font-medium text-blue-700 dark:text-blue-400 hover:underline truncate block max-w-[220px]">
                    {m.role_title}
                  </Link>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mandates.length === 0 && (
        <EmptyState title="No mandates match this view" description="Try a different filter, or create a new mandate." />
      )}

      {mandates.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11.5px] text-slate-400">
            Page {safePageNum} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPageNum((p) => Math.max(1, p - 1))}
              disabled={safePageNum === 1}
              className="text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePageNum) <= 2)
              .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("ellipsis");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`e${i}`} className="text-[12px] text-slate-300 px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPageNum(p)}
                    className={`text-[12px] font-medium rounded-lg px-2.5 py-1 tabular-nums ${
                      p === safePageNum
                        ? "bg-blue-600 text-white"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
              disabled={safePageNum === totalPages}
              className="text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg px-2.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
