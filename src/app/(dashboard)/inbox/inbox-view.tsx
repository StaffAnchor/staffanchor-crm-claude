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
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

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
    tint: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-slate-200",
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
      tint: "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 ring-slate-200",
    }
  );
}

// Groups the flat task-type list into the broader buckets a recruiter
// actually thinks in ("what's going on with interviews" / "which clients
// need a nudge") rather than one undifferentiated stream of nine task
// types. Any task type not explicitly mapped falls into "other" so a
// future task type never disappears -- it just lands in a catch-all
// section instead of breaking the grouping.
const GROUP_META: Record<string, { label: string; icon: typeof Flame }> = {
  interviews: { label: "Interviews", icon: CalendarClock },
  sourcing: { label: "Sourcing & mandates", icon: Compass },
  clients: { label: "Client relations", icon: MessageSquareWarning },
  candidates: { label: "Candidates", icon: UserPlus2 },
  offers: { label: "Offers & placements", icon: PartyPopper },
  other: { label: "Other", icon: Flame },
};

const TASK_TYPE_GROUP: Record<string, keyof typeof GROUP_META> = {
  TRIGGER_INTERVIEW_COORDINATION: "interviews",
  INTERVIEW_REMINDER: "interviews",
  STALE_MANDATE: "sourcing",
  CLIENT_FEEDBACK_OVERDUE: "clients",
  STALE_CANDIDATE: "candidates",
  MISSING_ASSESSMENT: "candidates",
  NEW_REFERRAL: "candidates",
  FOLLOW_UP_ON_OFFER: "offers",
  POST_PLACEMENT_CHECKIN: "offers",
};

const GROUP_ORDER: (keyof typeof GROUP_META)[] = ["interviews", "sourcing", "clients", "candidates", "offers", "other"];

function groupFor(taskType: string): keyof typeof GROUP_META {
  return TASK_TYPE_GROUP[taskType] ?? "other";
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
  // nav / optimistic updates stay simple. The final sort groups items into
  // the broader buckets (Interviews / Sourcing & mandates / Client
  // relations / Candidates / Offers & placements) a recruiter actually
  // thinks in, high-priority-first within each group; Array#sort is a
  // stable sort so items keep their original relative order (the RPC's
  // own ordering) within a group/priority tier.
  const visibleItems = useMemo(
    () =>
      items
        .filter((i) => {
          if (activeFilter !== "ALL" && i.task_type !== activeFilter) return false;
          if (recruiterFilter !== "ALL") {
            const key = i.is_unassigned ? UNASSIGNED_KEY : i.recruiter_id ?? UNASSIGNED_KEY;
            if (key !== recruiterFilter) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const ga = GROUP_ORDER.indexOf(groupFor(a.task_type));
          const gb = GROUP_ORDER.indexOf(groupFor(b.task_type));
          if (ga !== gb) return ga - gb;
          if (a.priority === "high" && b.priority !== "high") return -1;
          if (b.priority === "high" && a.priority !== "high") return 1;
          return 0;
        }),
    [items, activeFilter, recruiterFilter]
  );
  const focused = visibleItems[Math.min(focusedIdx, visibleItems.length - 1)] ?? null;

  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    visibleItems.forEach((i) => {
      const g = groupFor(i.task_type);
      m.set(g, (m.get(g) ?? 0) + 1);
    });
    return m;
  }, [visibleItems]);

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

  const filterOptions = useMemo(() => {
    const present = Array.from(filterCounts.keys());
    return present.sort((a, b) => (filterCounts.get(b) ?? 0) - (filterCounts.get(a) ?? 0));
  }, [filterCounts]);

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            Priority Actions
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            {items.length === 0
              ? "You're all caught up."
              : `${items.length} open item${items.length === 1 ? "" : "s"} needing action`}
          </p>
        </div>
        <div className="text-[11px] text-slate-400 hidden md:flex items-center gap-3">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">J</kbd>{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">K</kbd> navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">D</kbd> done
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">S</kbd> snooze
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">X</kbd> dismiss
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
            <Chip active={activeFilter === "ALL"} onClick={() => setActiveFilter("ALL")}>
              All ({items.length})
            </Chip>
            {filterOptions.map((taskType) => {
              const meta = metaFor(taskType);
              const Icon = meta.icon;
              const active = activeFilter === taskType;
              return (
                <Chip
                  key={taskType}
                  active={active}
                  icon={<Icon className="w-3 h-3" />}
                  onClick={() => setActiveFilter(active ? "ALL" : taskType)}
                >
                  {meta.label} ({filterCounts.get(taskType)})
                </Chip>
              );
            })}
          </div>

          {recruiterOptions.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={recruiterFilter}
                onChange={(e) => setRecruiterFilter(e.target.value)}
                className="text-[12px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 ring-1 ring-slate-200 rounded-full pl-3 pr-7 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 outline-none appearance-none cursor-pointer"
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
        <EmptyState
          className="py-20"
          title="Nothing needs your attention right now"
          description="New tasks appear here automatically as candidates move through your pipelines."
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<Flame className="w-5 h-5 text-slate-400" />}
          title="No items in this filter"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
          <div
            ref={listRef}
            className="bg-white dark:bg-slate-900 rounded-ros-lg border border-slate-200 dark:border-slate-700 shadow-ros-sm overflow-hidden"
          >
            {visibleItems.map((item, idx) => {
              const isFocused = idx === focusedIdx;
              const meta = metaFor(item.task_type);
              const Icon = meta.icon;
              const isResolving = resolvingId === item.id;
              const group = groupFor(item.task_type);
              const prevGroup = idx > 0 ? groupFor(visibleItems[idx - 1].task_type) : null;
              const showGroupHeader = group !== prevGroup;
              const GroupIcon = GROUP_META[group].icon;
              return (
                <div key={item.id}>
                  {showGroupHeader && (
                    <div
                      className={`flex items-center gap-1.5 px-4 py-1.5 bg-slate-50/80 dark:bg-slate-800/50 ${
                        idx > 0 ? "border-t border-slate-100 dark:border-slate-800" : ""
                      }`}
                    >
                      <GroupIcon className="w-3 h-3 text-slate-400" />
                      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {GROUP_META[group].label}
                      </span>
                      <span className="text-[10px] text-slate-400">· {groupCounts.get(group) ?? 0}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setFocusedIdx(idx)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0 transition-colors ${
                      isFocused ? "bg-blue-50/70" : "hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
                    }`}
                  >
                    <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${meta.tint}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{item.title}</span>
                        {item.priority === "high" && (
                          <Badge tone="warning" size="sm">
                            High
                          </Badge>
                        )}
                        {item.is_unassigned ? (
                          <Badge tone="success" size="sm" icon={<Users className="w-2.5 h-2.5" />}>
                            Team
                          </Badge>
                        ) : item.recruiter_name ? (
                          <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                            {item.recruiter_name}
                          </Badge>
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
                </div>
              );
            })}
          </div>

          <Card className="lg:sticky lg:top-20">
            {focused ? (
              <ContextDrawer item={focused} onResolve={resolve} onSnooze={snooze} resolving={resolvingId === focused.id} />
            ) : (
              <p className="text-[13px] text-slate-400">Select an item to see details.</p>
            )}
          </Card>
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
        className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 disabled:opacity-60"
      >
        <Clock className="w-3.5 h-3.5" />
        Snooze
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-40 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-10">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                onSnooze(opt.getDate());
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Module-level cache (not React state) so navigating away from an item and
// back doesn't re-request the same insight -- each item's AI take is
// generated once per page load, the same "compute once, reuse on revisit"
// pattern as the candidate AI passport being cached on the row itself,
// just kept in memory here since these one-liners aren't worth a DB column.
const aiInsightCache = new Map<string, { status: "loading" | "done" | "error"; text: string }>();

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
  const [, forceRerender] = useState(0);

  useEffect(() => {
    setSending(false);
    setSendResult(null);
  }, [item.id]);

  // Auto-fetch a one-line "why this matters / what to do" AI take as soon
  // as an item is opened, the same "AI context appears automatically"
  // pattern used for the candidate passport, rather than requiring an
  // extra click. Cached per item so re-focusing never re-fetches.
  useEffect(() => {
    if (aiInsightCache.has(item.id)) return;
    aiInsightCache.set(item.id, { status: "loading", text: "" });
    forceRerender((n) => n + 1);
    (async () => {
      try {
        const res = await fetch("/api/inbox/ai-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskType: item.task_type,
            title: item.title,
            detail: item.detail,
            priority: item.priority,
            candidateName: item.candidate_name,
            mandateRoleTitle: item.mandate_role_title,
            mandateClientName: item.mandate_client_name,
          }),
        });
        const body = await res.json();
        if (res.ok && body.insight) {
          aiInsightCache.set(item.id, { status: "done", text: body.insight });
        } else {
          aiInsightCache.set(item.id, { status: "error", text: body.error ?? "Couldn't generate an AI insight." });
        }
      } catch {
        aiInsightCache.set(item.id, { status: "error", text: "Couldn't generate an AI insight." });
      }
      forceRerender((n) => n + 1);
    })();
  }, [item.id, item.task_type, item.title, item.detail, item.priority, item.candidate_name, item.mandate_role_title, item.mandate_client_name]);

  const aiInsight = aiInsightCache.get(item.id);

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
              <Badge tone="success" size="sm" icon={<Users className="w-2.5 h-2.5" />}>
                Team task
              </Badge>
            ) : item.recruiter_name ? (
              <Badge tone="neutral" size="sm" icon={<Users className="w-2.5 h-2.5" />} className="normal-case tracking-normal">
                {item.recruiter_name}
              </Badge>
            ) : null}
          </p>
          <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">{item.title}</p>
        </div>
      </div>

      {item.detail && <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-4">{item.detail}</p>}

      {/* AI take: why this specific task matters + what to do, generated
          automatically on open (see aiInsightCache above) -- a sharper,
          situation-specific gloss on top of the rule-computed task. */}
      <div className="flex items-start gap-2 rounded-ros-md bg-indigo-50/70 border border-indigo-100 px-3 py-2.5 mb-4">
        <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
        {!aiInsight || aiInsight.status === "loading" ? (
          <span className="text-[12px] text-slate-400 italic">Thinking...</span>
        ) : aiInsight.status === "error" ? (
          <span className="text-[12px] text-slate-400">{aiInsight.text}</span>
        ) : (
          <p className="text-[12.5px] text-slate-700 dark:text-slate-300 leading-snug">{aiInsight.text}</p>
        )}
      </div>

      <div className="space-y-2 mb-5">
        {item.candidate_id && (
          <Link
            href={`/candidates/${item.candidate_id}`}
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
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
            className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSendUpdate}
            disabled={sending}
            icon={sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            className="w-full mb-2 !text-emerald-700 !bg-emerald-50 hover:!bg-emerald-100 ring-emerald-200"
          >
            Send Update via WhatsApp
          </Button>
          {sendResult && (
            <p className={`text-[11px] mb-3 ${sendResult.ok ? "text-emerald-600" : "text-slate-500 dark:text-slate-400"}`}>
              {sendResult.message}
            </p>
          )}
        </>
      )}

      <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onResolve(item.id, "done")}
          disabled={resolving}
          icon={resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          className="flex-1 !bg-emerald-600 hover:!bg-emerald-500"
        >
          Mark done
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">D</kbd>
        </Button>
        <SnoozeMenu onSnooze={(until) => onSnooze(item.id, until)} disabled={resolving} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onResolve(item.id, "dismissed")}
          disabled={resolving}
          icon={<X className="w-3.5 h-3.5" />}
        >
          Dismiss
          <kbd className="ml-1 text-[10px] opacity-70 font-mono">X</kbd>
        </Button>
      </div>
    </div>
  );
}
