"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
  UserCog,
  Briefcase,
  UploadCloud,
  UserPlus,
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
  // Read-only candidate snapshot -- only populated when candidate_id is set
  // (e.g. INCOMPLETE_PROFILE tasks) -- lets the task card show "who is this"
  // at a glance (domain, category, experience, current role) instead of
  // just a name, so a recruiter can judge interest/urgency before clicking
  // in. Optional since older cached data or non-candidate tasks won't have it.
  candidate_category?: string | null;
  candidate_sub_domain?: string | null;
  candidate_experience_years?: number | null;
  candidate_current_job_title?: string | null;
  candidate_current_employer?: string | null;
  candidate_current_location?: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
};

const UNASSIGNED_KEY = "__unassigned__";
// Execution-audit gap: the inbox defaulted to showing the whole firm's open
// items, with "just mine" only reachable via a manual filter step the
// person had to remember to take every visit. MINE_KEY groups "assigned to
// me" together with unassigned/team tasks (rather than a strict "only mine"
// filter), since an unclaimed high-priority team task is still something a
// recruiter should see on their default landing view, not just their own
// named assignments.
const MINE_KEY = "__mine__";

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
  INCOMPLETE_PROFILE: {
    icon: UserCog,
    label: "Incomplete profile",
    tint: "bg-cyan-50 text-cyan-700 ring-cyan-200",
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
  INCOMPLETE_PROFILE: "candidates",
};

const GROUP_ORDER: (keyof typeof GROUP_META)[] = ["interviews", "sourcing", "clients", "candidates", "offers", "other"];

function groupFor(taskType: string): keyof typeof GROUP_META {
  return TASK_TYPE_GROUP[taskType] ?? "other";
}

// Rebuilt per direct feedback: a single flat "Priority Actions" list with
// buried filter chips still made a recruiter hold the whole picture in her
// head ("do I have mandate work? should I be sourcing instead?"). Three
// fixed, always-visible boxes replace that -- exactly the three things a
// recruiter is ever actually doing: working an active mandate, building
// future pipeline (the answer to "what do I do with no mandate"), or
// completing candidate profiles already in the system. Clicking a box is
// the only navigation required; nothing here needs to be remembered.
type BoxKey = "mandate" | "pipeline" | "profiles";

const BOX_META: Record<BoxKey, { label: string; description: string; icon: typeof Flame; tint: string }> = {
  mandate: {
    label: "Mandate Tasks",
    description: "Interviews, client feedback, stale candidates -- everything tied to a live mandate.",
    icon: Briefcase,
    tint: "border-blue-200 bg-blue-50/60 text-blue-900",
  },
  pipeline: {
    label: "Build Pipeline",
    description: "Add new candidates for future mandates -- especially when nothing's active right now.",
    icon: UserPlus,
    tint: "border-teal-200 bg-teal-50/60 text-teal-900",
  },
  profiles: {
    label: "Profile Completion",
    description: "Existing candidates missing fields -- get them match-ready before a mandate needs them.",
    icon: UserCog,
    tint: "border-amber-200 bg-amber-50/60 text-amber-900",
  },
};

const BOX_ORDER: BoxKey[] = ["mandate", "pipeline", "profiles"];

// Every task type maps to exactly one box; anything unmapped (future task
// types) defaults to "mandate" -- the safest catch-all, since that's the
// primary work queue and nothing should silently vanish from it.
const TASK_TYPE_BOX: Record<string, BoxKey> = {
  TRIGGER_INTERVIEW_COORDINATION: "mandate",
  INTERVIEW_REMINDER: "mandate",
  STALE_MANDATE: "mandate",
  CLIENT_FEEDBACK_OVERDUE: "mandate",
  STALE_CANDIDATE: "mandate",
  MISSING_ASSESSMENT: "mandate",
  FOLLOW_UP_ON_OFFER: "mandate",
  POST_PLACEMENT_CHECKIN: "mandate",
  NEW_REFERRAL: "pipeline",
  INCOMPLETE_PROFILE: "profiles",
};

function boxFor(taskType: string): BoxKey {
  return TASK_TYPE_BOX[taskType] ?? "mandate";
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

export type RecruiterOption = { id: string; full_name: string | null; email: string };

export default function InboxView({
  initialItems,
  fetchError,
  recruiters,
  currentUserId = null,
  performanceCard = null,
  hasActiveMandates = true,
}: {
  initialItems: InboxItem[];
  fetchError: string | null;
  recruiters: RecruiterOption[];
  currentUserId?: string | null;
  performanceCard?: React.ReactNode;
  // Drives which box opens by default: a recruiter with no active mandate
  // assignment lands on "Build Pipeline" instead of an empty "Mandate
  // Tasks" box. Defaults true (no behavior change) for surfaces that don't
  // know this yet (e.g. the vendor inbox, which passes nothing).
  hasActiveMandates?: boolean;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<InboxItem[]>(initialItems);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  // URL-persisted, same pattern as the Sales board fix (gap #8, July 2026
  // audit) -- filtering to just "Interview reminders" or one recruiter and
  // then clicking into a candidate/mandate and back used to silently reset
  // to "All" every time, since it lived in useState alone.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get("type") ?? "ALL";
  // Defaults to "My day" (mine + unassigned) rather than the whole firm --
  // execution-audit gap #1: the only way to see "just what's on me today"
  // used to be a manual filter step taken fresh on every visit. Explicitly
  // choosing "Everyone" (or any other recruiter) still persists via the URL
  // exactly as before. Falls back to ALL when no session user is known
  // (shouldn't happen on an authenticated page, but keeps this safe).
  const recruiterFilter = searchParams.get("recruiter") ?? (currentUserId ? MINE_KEY : "ALL");
  // Which of the three boxes is open. Defaults to Mandate Tasks when the
  // recruiter has an active assignment, otherwise Build Pipeline -- exactly
  // the "what do I do with no mandate" answer from feedback, applied
  // automatically instead of the recruiter having to notice and navigate.
  const activeBox = (searchParams.get("box") as BoxKey | null) ?? (hasActiveMandates ? "mandate" : "pipeline");

  function setActiveBox(next: BoxKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("box", next);
    params.delete("type"); // sub-filter chips are scoped to a box; switching boxes clears a now-irrelevant one
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setActiveFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "ALL") params.set("type", next);
    else params.delete("type");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  function setRecruiterFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "ALL") params.set("recruiter", next);
    else params.delete("recruiter");
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }

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
  // Items after the recruiter-scope filter only (My day / Everyone / one
  // person) -- the shared base every box's count and the active box's own
  // list are both drawn from, so switching boxes never has to re-derive
  // recruiter scoping.
  const recruiterScopedItems = useMemo(
    () =>
      items.filter((i) => {
        if (recruiterFilter === MINE_KEY) return i.is_unassigned || i.recruiter_id === currentUserId;
        if (recruiterFilter === "ALL") return true;
        const key = i.is_unassigned ? UNASSIGNED_KEY : i.recruiter_id ?? UNASSIGNED_KEY;
        return key === recruiterFilter;
      }),
    [items, recruiterFilter, currentUserId]
  );

  // Count per box, within the current recruiter scope -- what each of the
  // three boxes actually shows on its face.
  const boxCounts = useMemo(() => {
    const m = new Map<BoxKey, number>();
    for (const i of recruiterScopedItems) m.set(boxFor(i.task_type), (m.get(boxFor(i.task_type)) ?? 0) + 1);
    return m;
  }, [recruiterScopedItems]);

  const visibleItems = useMemo(
    () =>
      recruiterScopedItems
        .filter((i) => {
          if (boxFor(i.task_type) !== activeBox) return false;
          if (activeFilter !== "ALL" && i.task_type !== activeFilter) return false;
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
    [recruiterScopedItems, activeBox, activeFilter]
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

  // Type sub-filter chips are scoped to the active box (e.g. no point
  // showing an "Incomplete profile" chip while inside Mandate Tasks).
  const itemsInActiveBox = useMemo(
    () => recruiterScopedItems.filter((i) => boxFor(i.task_type) === activeBox),
    [recruiterScopedItems, activeBox]
  );

  const filterCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of itemsInActiveBox) counts.set(i.task_type, (counts.get(i.task_type) ?? 0) + 1);
    return counts;
  }, [itemsInActiveBox]);

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

  const myDayCount = useMemo(
    () => items.filter((i) => i.is_unassigned || i.recruiter_id === currentUserId).length,
    [items, currentUserId]
  );

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

  // Manual-only recruiter assignment -- no auto-assign logic, per product
  // decision. Direct table write (same pattern as MandateStaffingControl's
  // mandate_assignments writes) since recruiter_inbox's RLS update policy
  // already permits any staff member to update any row.
  const assignRecruiter = useCallback(
    async (id: string, recruiterId: string | null) => {
      const prevItems = items;
      setItems((cur) =>
        cur.map((i) =>
          i.id === id
            ? {
                ...i,
                recruiter_id: recruiterId,
                recruiter_name: recruiterId ? recruiters.find((r) => r.id === recruiterId)?.full_name ?? recruiters.find((r) => r.id === recruiterId)?.email ?? null : null,
                is_unassigned: !recruiterId,
              }
            : i
        )
      );
      const { error } = await supabase.from("recruiter_inbox").update({ recruiter_id: recruiterId }).eq("id", id);
      if (error) setItems(prevItems);
    },
    [items, recruiters, supabase]
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
      {performanceCard}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            My Desk
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
            {recruiterScopedItems.length === 0
              ? "You're all caught up."
              : `${recruiterScopedItems.length} open item${recruiterScopedItems.length === 1 ? "" : "s"} across the three boxes below`}
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

      {/* The three fixed boxes -- always visible, always in this order, so
          "what do I work on" never requires remembering where a filter was
          left. Each is its own click target, not a chip buried in a row. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {BOX_ORDER.map((box) => {
          const meta = BOX_META[box];
          const Icon = meta.icon;
          const count = boxCounts.get(box) ?? 0;
          const active = activeBox === box;
          return (
            <button
              key={box}
              onClick={() => setActiveBox(box)}
              className={`text-left rounded-xl border p-4 transition-all ${
                active ? `${meta.tint} ring-2 ring-offset-1 ring-current` : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${active ? "" : "text-slate-900 dark:text-slate-100"}`}>
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </span>
                <span
                  className={`text-[12px] font-bold tabular-nums rounded-full px-2 py-0.5 ${
                    active ? "bg-white/70" : count > 0 ? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300" : "bg-slate-50 dark:bg-slate-800/50 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </div>
              <p className={`text-[11.5px] ${active ? "opacity-80" : "text-slate-400"}`}>{meta.description}</p>
            </button>
          );
        })}
      </div>

      {activeBox === "pipeline" && (
        <div className="bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 rounded-xl p-4 mb-4">
          {!hasActiveMandates && (
            <p className="text-[12px] text-teal-800 dark:text-teal-300 mb-3">
              No active mandate assigned to you right now -- this is exactly the time to build pipeline ahead of the
              next one landing.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Link
              href="/candidates/new"
              className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-teal-100 dark:border-teal-900 px-3 py-2.5 hover:bg-teal-50/50 dark:hover:bg-teal-900/20"
            >
              <UserPlus className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">Add a new candidate</span>
            </Link>
            <Link
              href="/candidates/bulk-upload"
              className="flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-teal-100 dark:border-teal-900 px-3 py-2.5 hover:bg-teal-50/50 dark:hover:bg-teal-900/20"
            >
              <UploadCloud className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">Bulk upload resumes</span>
            </Link>
          </div>
        </div>
      )}

      {itemsInActiveBox.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {activeBox === "mandate" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <Chip active={activeFilter === "ALL"} onClick={() => setActiveFilter("ALL")}>
                All ({itemsInActiveBox.length})
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
          )}

          {(recruiterOptions.length > 1 || currentUserId) && (
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
                {currentUserId && <option value={MINE_KEY}>My day ({myDayCount})</option>}
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

      {recruiterScopedItems.length === 0 && !fetchError ? (
        <EmptyState
          className="py-20"
          title="Nothing needs your attention right now"
          description="New tasks appear here automatically as candidates move through your pipelines."
        />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          className="py-16"
          icon={<Flame className="w-5 h-5 text-slate-400" />}
          title={`Nothing in ${BOX_META[activeBox].label} right now`}
          description={
            recruiterFilter === MINE_KEY
              ? "Nothing assigned to you or the team right now -- switch to \"Everyone\" above to see what else is open."
              : undefined
          }
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
              // Only the Mandate Tasks box mixes several task types worth
              // sub-grouping (Interviews / Client relations / etc) -- Build
              // Pipeline and Profile Completion are each a single task type,
              // so a group header would just repeat the box name for no reason.
              const showGroupHeader = activeBox === "mandate" && group !== prevGroup;
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
                      {item.task_type === "INCOMPLETE_PROFILE" ? (
                        <span className="flex flex-wrap items-center gap-1 mt-1">
                          {item.candidate_category && (
                            <span className="inline-flex items-center rounded-md bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 text-[10.5px] font-medium px-1.5 py-0.5">
                              {CATEGORY_LABEL[item.candidate_category] ?? item.candidate_category}
                            </span>
                          )}
                          {item.candidate_sub_domain && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10.5px] font-medium px-1.5 py-0.5">
                              {item.candidate_sub_domain}
                            </span>
                          )}
                          {item.candidate_experience_years != null && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10.5px] font-medium px-1.5 py-0.5">
                              {item.candidate_experience_years} yrs exp
                            </span>
                          )}
                          {(item.candidate_current_job_title || item.candidate_current_employer) && (
                            <span className="text-[10.5px] text-slate-400 truncate">
                              {[item.candidate_current_job_title, item.candidate_current_employer].filter(Boolean).join(" @ ")}
                            </span>
                          )}
                          <span className="text-[10.5px] text-slate-300">· {timeAgo(item.created_at)}</span>
                        </span>
                      ) : (
                        <span className="block text-[11px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</span>
                      )}
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
              <ContextDrawer
                item={focused}
                onResolve={resolve}
                onSnooze={snooze}
                onAssign={assignRecruiter}
                recruiters={recruiters}
                resolving={resolvingId === focused.id}
              />
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
  onAssign,
  recruiters,
  resolving,
}: {
  item: InboxItem;
  onResolve: (id: string, status: "done" | "dismissed") => void;
  onSnooze: (id: string, until: Date) => void;
  onAssign: (id: string, recruiterId: string | null) => void;
  recruiters: RecruiterOption[];
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

      {item.task_type === "INCOMPLETE_PROFILE" &&
        (item.candidate_category || item.candidate_sub_domain || item.candidate_experience_years != null || item.candidate_current_job_title) && (
          <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2.5 mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">At a glance</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {item.candidate_category && (
                <Badge tone="neutral" size="sm" className="!bg-cyan-50 !text-cyan-700 dark:!bg-cyan-950/40 dark:!text-cyan-300 normal-case tracking-normal">
                  {CATEGORY_LABEL[item.candidate_category] ?? item.candidate_category}
                </Badge>
              )}
              {item.candidate_sub_domain && (
                <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                  {item.candidate_sub_domain}
                </Badge>
              )}
              {item.candidate_experience_years != null && (
                <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                  {item.candidate_experience_years} yrs exp
                </Badge>
              )}
              {item.candidate_current_location && (
                <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                  {item.candidate_current_location}
                </Badge>
              )}
            </div>
            {(item.candidate_current_job_title || item.candidate_current_employer) && (
              <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-1.5">
                {[item.candidate_current_job_title, item.candidate_current_employer].filter(Boolean).join(" at ")}
              </p>
            )}
          </div>
        )}

      {item.detail && <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-4">{item.detail}</p>}

      {/* Manual recruiter assignment -- writes straight to recruiter_inbox.recruiter_id.
          No auto-assign logic (future item); this is the only assignment control in the
          inbox UI today, since the item list previously only had a *filter* by recruiter,
          not a way to actually set it. */}
      <div className="flex items-center gap-2 mb-4">
        <UserCog className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <select
          value={item.recruiter_id ?? ""}
          onChange={(e) => onAssign(item.id, e.target.value || null)}
          className="flex-1 text-[12px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-300"
        >
          <option value="">Unassigned</option>
          {recruiters.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name ?? r.email}
            </option>
          ))}
        </select>
      </div>

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
        {item.candidate_id && item.task_type === "INCOMPLETE_PROFILE" ? (
          // Distinct, unambiguous CTA for profile-completion tasks specifically
          // -- this is the affordance for "how does a recruiter pick which
          // profile to complete": click through here, fill in the missing
          // fields on the candidate edit form, and save. Attribution for the
          // completion is handled automatically server-side (a DB trigger
          // stamps profile_completed_by/at the moment the record flips from
          // incomplete to complete), so there's nothing else to click.
          <Link
            href={
              item.mandate_id
                ? `/candidates/${item.candidate_id}?mandateId=${item.mandate_id}&back=inbox-profiles`
                : `/candidates/${item.candidate_id}?back=inbox-profiles`
            }
            className="flex items-center justify-between rounded-lg bg-teal-600 hover:bg-teal-700 px-3 py-2.5 text-[12.5px] text-white transition-colors"
          >
            <span className="font-medium">
              Open profile to complete: {item.candidate_name ?? "this candidate"}
            </span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          item.candidate_id && (
            <Link
              href={item.mandate_id ? `/candidates/${item.candidate_id}?mandateId=${item.mandate_id}` : `/candidates/${item.candidate_id}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
            >
              <span>
                Candidate: <span className="font-medium">{item.candidate_name ?? "View profile"}</span>
              </span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </Link>
          )
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
