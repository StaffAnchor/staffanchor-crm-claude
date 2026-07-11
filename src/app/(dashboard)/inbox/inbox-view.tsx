"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Flame,
  CalendarClock,
  CalendarCheck2,
  Clock,
  ClipboardList,
  Compass,
  PartyPopper,
  MessageSquareWarning,
  UserPlus2,
  CheckCircle2,
  X,
  ArrowRight,
  Loader2,
  MessageCircle,
  Users,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type InboxItem = {
  id: string;
  created_at: string;
  candidate_id: string | null;
  candidate_name: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  client_id: string | null;
  task_type: string;
  title: string;
  detail: string | null;
  priority: "low" | "normal" | "high";
  status: "open" | "snoozed" | "done" | "dismissed";
  snoozed_until: string | null;
  is_unassigned: boolean;
  recruiter_id: string | null;
  recruiter_name: string | null;
};

const UNASSIGNED_KEY = "__unassigned__";

const TASK_META: Record<string, { icon: typeof Flame; label: string; tint: string }> = {
  TRIGGER_INTERVIEW_COORDINATION: {
    icon: CalendarClock,
    label: "Interview coordination",
    tint: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  FOLLOW_UP_ON_OFFER: {
    icon: ArrowRight,
    label: "Offer follow-up",
    tint: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  },
  INTERVIEW_REMINDER: {
    icon: CalendarCheck2,
    label: "Interview reminder",
    tint: "bg-rose-50 text-rose-700 ring-rose-200",
  },
  STALE_CANDIDATE: {
    icon: Clock,
    label: "No movement",
    tint: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  MISSING_ASSESSMENT: {
    icon: ClipboardList,
    label: "Missing assessment",
    tint: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  STALE_MANDATE: {
    icon: Compass,
    label: "Needs sourcing",
    tint: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  POST_PLACEMENT_CHECKIN: {
    icon: PartyPopper,
    label: "Check-in",
    tint: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  CLIENT_FEEDBACK_OVERDUE: {
    icon: MessageSquareWarning,
    label: "Client feedback overdue",
    tint: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  },
  NEW_REFERRAL: {
    icon: UserPlus2,
    label: "New referral",
    tint: "bg-teal-50 text-teal-700 ring-teal-200",
  },
};

function metaFor(taskType: string) {
  return (
    TASK_META[taskType] ?? {
      icon: Flame,
      label: "Action needed",
      tint: "bg-slate-50 text-slate-700 ring-slate-200",
    }
  );
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function nextMorning(daysAhead: number, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export default function InboxView({
  initialItems,
  fetchError,
}: {
  initialItems: InboxItem[];
  fetchError: string | null;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>(initialItems);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [recruiterFilter, setRecruiterFilter] = useState<string>("ALL");
  const listRef = useRef<HTMLDivElement>(null);

  // Filtering by task type / recruiter is purely a view-layer concern --
  // the underlying `items` state (and its indices) always holds everything
  // the viewer is allowed to see (now the whole team's inbox), so keyboard
  // nav / optimistic updates stay simple.
  const visibleItems = useMemo(
    () =>
      items.filter((i) => {
        if (activeFilter !== "ALL" && i.task_type !== activeFilter) return false;
        if (recruiterFilter !== "ALL") {
          const key = i.is_unassigned ? UNASSIGNED_KEY : i.recruiter_id ?? UNASSIGNED_KEY;
          if (key !== recruiterFilter) return false;
        }
        return true;
      }),
    [items, activeFilter, recruiterFilter]
  );
  const focused = visibleItems[Math.min(focusedIdx, visibleItems.length - 1)] ?? null;

  const filterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.task_type, (counts.get(i.task_type) ?? 0) + 1);
    return counts;
  }, [items]);

  const recruiterOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const i of items) {
      const key = i.is_unassigned ? UNASSIGNED_KEY : i.recruiter_id ?? UNASSIGNED_KEY;
      const label = i.is_unassigned ? "Unassigned / Team" : i.recruiter_name ?? "Unknown";
      const existing = byKey.get(key);
      byKey.set(key, { label, count: (existing?.count ?? 0) + 1 });
    }
    return Array.from(byKey.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => {
        if (a.key === UNASSIGNED_KEY) return 1;
        if (b.key === UNASSIGNED_KEY) return -1;
        return a.label.localeCompare(b.label);
      });
  }, [items]);

  const resolve = useCallback(
    async (id: string, status: "done" | "dismissed") => {
      const prevItems = items;
      setResolvingId(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
      const { error } = await supabase.rpc("resolve_inbox_item", { p_id: id, p_status: status });
      setResolvingId(null);
      if (error) setItems(prevItems);
    },
    [items, supabase]
  );

  const snooze = useCallback(
    async (id: string, until: Date) => {
      const prevItems = items;
      setResolvingId(id);
      setItems((cur) => cur.filter((i) => i.id !== id));
      const { error } = await supabase.rpc("snooze_inbox_item", { p_id: id, p_until: until.toISOString() });
      setResolvingId(null);
      if (error) setItems(prevItems);
    },
    [items, supabase]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIdx((i) => Math.min(i + 1, visibleItems.length - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIdx((i) => Math.max(i - 1, 0));
      } else if ((e.key === "d" || e.key === "D") && focused) {
        e.preventDefault();
        resolve(focused.id, "done");
      } else if (e.key === "x" || e.key === "X") {
        if (focused) {
          e.preventDefault();
          resolve(focused.id, "dismissed");
        }
      } else if (e.key === "s" || e.key === "S") {
        if (focused) {
          e.preventDefault();
          snooze(focused.id, nextMorning(1));
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visibleItems.length, focused, resolve, snooze]);

  useEffect(() => {
    if (focusedIdx >= visibleItems.length) {
      setFocusedIdx(Math.max(visibleItems.length - 1, 0));
    }
  }, [visibleItems.length, focusedIdx]);

  const grouped = useMemo(() => {
    const high = visibleItems.filter((i) => i.priority === "high");
    const rest = visibleItems.filter((i) => i.priority !== "high");
    return { high, rest };
  }, [visibleItems]);

  const filterOptions = useMemo(() => {
    const present = Array.from(filterCounts.keys());
    return present.sort((a, b) => (filterCounts.get(b) ?? 0) - (filterCounts.get(a) ?? 0));
  }, [filterCounts]);

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Priority Actions
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {items.length === 0
              ? "You're all caught up."
              : `${items.length} open item${items.length === 1 ? "" : "s"} needing action`}
          </p>
        </div>
        <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">J</kbd>{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">K</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">D</kbd> done
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">S</kbd> snooze
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono">X</kbd> dismiss
          </span>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          Couldn&apos;t load your inbox: {fetchError}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveFilter("ALL")}
              className={`shrink-0 text-[12px] font-medium rounded-full px-3 py-1.5 ring-1 transition-colors ${
                activeFilter === "ALL"
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              All ({items.length})
            </button>
            {filterOptions.map((taskType) => {
              const meta = metaFor(taskType);
              const Icon = meta.icon;
              const active = activeFilter === taskType;
              return (
                <button
                  key={taskType}
                  onClick={() => setActiveFilter(active ? "ALL" : taskType)}
                  className={`shrink-0 flex items-center gap-1.5 text-[12px] font-medium rounded-full px-3 py-1.5 ring-1 transition-colors ${
                    active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label} ({filterCounts.get(taskType)})
                </button>
              );
            })}
          </div>

          {recruiterOptions.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={recruiterFilter}
                onChange={(e) => setRecruiterFilter(e.target.value)}
                className="text-[12px] font-medium text-slate-700 bg-white ring-1 ring-slate-200 rounded-full pl-3 pr-7 py-1.5 hover:bg-slate-50 outline-none appearance-none cursor-pointer"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  backgroundSize: "14px",
                }}
              >
                <option value="ALL">Everyone ({items.length})</option>
                {recruiterOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label} ({opt.count})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {items.length === 0 && !fetchError ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <p className="text-[14px] font-medium text-slate-700">Nothing needs your attention right now</p>
          <p className="text-[12px] text-slate-500 mt-1">
            New tasks appear here automatically as candidates move through your pipelines.
          </p>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-16 flex flex-col items-center justify-center text-center">
          <p className="text-[13px] text-slate-500">No items in this filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
          <div ref={listRef} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {[...grouped.high, ...grouped.rest].map((item) => {
              const idx = visibleItems.findIndex((i) => i.id === item.id);
              const isFocused = idx === focusedIdx;
              const meta = metaFor(item.task_type);
              const Icon = meta.icon;
              const isResolving = resolvingId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setFocusedIdx(idx)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
                    isFocused ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${meta.tint}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-900 truncate">{item.title}</span>
                      {item.priority === "high" && (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 ring-1 ring-orange-200 rounded-full px-1.5 py-0.5">
                          High
                        </span>
                      )}
                      {item.is_unassigned ? (
                        <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-600 bg-teal-50 ring-1 ring-teal-200 rounded-full px-1.5 py-0.5">
                          <Users className="w-2.5 h-2.5" /> Team
                        </span>
                      ) : item.recruiter_name ? (
                        <span className="shrink-0 text-[10px] font-medium text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">
                          {item.recruiter_name}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</span>
                  </span>
                  {isResolving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-20">
            {focused ? (
              <ContextDrawer item={focused} onResolve={resolve} onSnooze={snooze} resolving={resolvingId === focused.id} />
            ) : (
              <p className="text-[13px] text-slate-400">Select an item to see details.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SnoozeMenu({ onSnooze, disabled }: { onSnooze: (until: Date) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const options = [
    { label: "Tomorrow, 9am", getDate: () => nextMorning(1) },
    { label: "In 3 days", getDate: () => nextMorning(3) },
    { label: "Next week", getDate: () => nextMorning(7) },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-60"
      >
        <Clock className="w-3.5 h-3.5" />
        Snooze
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-10">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                onSnooze(opt.getDate());
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContextDrawer({
  item,
  onResolve,
  onSnooze,
  resolving,
}: {
  item: InboxItem;
  onResolve: (id: string, status: "done" | "dismissed") => void;
  onSnooze: (id: string, until: Date) => void;
  resolving: boolean;
}) {
  const meta = metaFor(item.task_type);
  const Icon = meta.icon;
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setSending(false);
    setSendResult(null);
  }, [item.id]);

  async function handleSendUpdate() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxItemId: item.id }),
      });
      const body = await res.json();
      if (body.ok) {
        setSendResult({ ok: true, message: "WhatsApp update sent." });
      } else if (body.status === "not_configured") {
        setSendResult({ ok: false, message: "WhatsApp isn't connected yet -- this will send automatically once it's set up." });
      } else {
        setSendResult({ ok: false, message: body.error ?? "Couldn't send the update." });
      }
    } catch {
      setSendResult({ ok: false, message: "Couldn't send the update." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-4">
        <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ring-1 ${meta.tint}`}>
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
            {meta.label}
            {item.is_unassigned ? (
              <span className="flex items-center gap-0.5 text-teal-600">
                <Users className="w-2.5 h-2.5" /> Team task
              </span>
            ) : item.recruiter_name ? (
              <span className="flex items-center gap-0.5 text-slate-500 normal-case font-medium">
                <Users className="w-2.5 h-2.5" /> {item.recruiter_name}
              </span>
            ) : null}
          </p>
          <p className="text-[14px] font-semibold text-slate-900 leading-snug">{item.title}</p>
        </div>
      </div>

      {item.detail && <p className="text-[13px] text-slate-600 mb-4">{item.detail}</p>}

      <div className="space-y-2 mb-5">
        {item.candidate_id && (
          <Link
            href={`/candidates/${item.candidate_id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <span>
              Candidate: <span className="font-medium">{item.candidate_name ?? "View profile"}</span>
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </Link>
        )}
        {item.mandate_id && (
          <Link
            href={`/mandates/${item.mandate_id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50"
          >
            <span>
              Mandate:{" "}
              <span className="font-medium">
                {item.mandate_role_title ?? "View mandate"}
                {item.mandate_client_name ? ` · ${item.mandate_client_name}` : ""}
              </span>
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
          </Link>
        )}
      </div>

      {item.candidate_id && (
        <>
          <button
            onClick={handleSendUpdate}
            disabled={sending}
            className="w-full mb-2 flex items-center justify-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 ring-1 ring-emerald-200 rounded-lg px-3 py-2 disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            Send Update via WhatsApp
          </button>
          {sendResult && (
            <p className={`text-[11px] mb-3 ${sendResult.ok ? "text-emerald-600" : "text-slate-500"}`}>
              {sendResult.message}
            </p>
          )}
        </>
      )}

      <div className="flex items-center gap-2 pt-4 border-t border-slate-100">
        <button
          onClick={() => onResolve(item.id, "done")}
          disabled={resolving}
          className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg px-3 py-2 disabled:opacity-60"
        >
          {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Mark done
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">D</kbd>
        </button>
        <SnoozeMenu onSnooze={(until) => onSnooze(item.id, until)} disabled={resolving} />
        <button
          onClick={() => onResolve(item.id, "dismissed")}
          disabled={resolving}
          className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 disabled:opacity-60"
        >
          <X className="w-3.5 h-3.5" />
          Dismiss
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">X</kbd>
        </button>
      </div>
    </div>
  );
}
